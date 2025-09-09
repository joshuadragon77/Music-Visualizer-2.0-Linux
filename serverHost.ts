import Express from "express";
import HTTP from "http";
import FileSystem from "fs";

import * as ChildProcess from "child_process";

import { SpotifyState } from "./modules/classes.js";

import * as console from "./modules/consolescript.js";
import { LowLevelJadeDB } from "./modules/jadestores.js";
import { TransmissionServer, attemptLoadModule, EventEmitter } from "./modules/transmission.js";
import { JadeStruct } from "./modules/jadestruct.js";

import { DBusInterface, getBus, registerService } from "dbus";

type LyricalInstruction = {
    newString: string;
    time: number;
}

type LyricalLine = {
    line: string;
    startTime: number;
    endTime: number;
    lyricalInstructions: LyricalInstruction[];
    index: number;
    disapparenceThresholdTime: number;
}

type JadeLyrics = {
    trackName: string;
    timeLength: number;
    lyricalLinesTimeReferences: LyricalLine[];
    lyricalLines: LyricalLine[];
}
type FrequencySample = [Buffer, number]

type DFTEngineAudioSample = {
    samples: FrequencySample[],
    spotifyID: string,
    recordedDuration: number,
    dateRecorded: Date,
    dateStarted: Date,
    dftEngineSource: "cava" | "jade"
}

class AudioListener{

    static database = new LowLevelJadeDB("./stores/dftEngineCache.db", 16384);

    static transmissionServer: TransmissionServer;

    static audioListenerProcess: ChildProcess.ChildProcessWithoutNullStreams | null = null;
    static currentLoudness = 0;
    static currentLoudnessArray: number[] = [];

    static listeningIntervalProcess: NodeJS.Timeout[] = [];

    static currentSpotifyState: SpotifyState | undefined;
    static dftLookupTable = new Map<string, number>();
    static currentDFTEngineSamples: FrequencySample[] = [];
    
    static startAudioListening(){
        if (AudioListener.audioListenerProcess)
            return;

        let currentAudioStream = ChildProcess.spawn("java", ["-jar", "DFTEngine.jar"]);//ChildProcess.spawn("cava", ["-p", "cava.config"]);//ChildProcess.spawn("java", ["--enable-preview", "-jar", "AudioListener.jar"]);
        AudioListener.listeningIntervalProcess.push(setInterval(()=>{

            let dataLength = 100;
            let data = currentAudioStream.stdout.read(dataLength) as Buffer;

            if (data != null){
            
                let rawAudioData = data.subarray(data.length-dataLength);
                let correctedAudio = "";
                let correctedAudioArray: Buffer = Buffer.alloc(100, 0);

                let nonZeroAudioData = true;

                for (let i = 0;i<dataLength;i++){
                    AudioListener.currentLoudnessArray[i] = rawAudioData.readUInt8(i) / 255;
                    correctedAudio += String.fromCharCode(Math.round(Math.min(255, AudioListener.currentLoudnessArray[i] * 255)));
                    correctedAudioArray.writeUInt8(Math.round(Math.min(255, AudioListener.currentLoudnessArray[i] * 255)), i);
                    
                    nonZeroAudioData = nonZeroAudioData && AudioListener.currentLoudnessArray[i] == 0;
                }
                currentAudioStream.stdout.read(dataLength);
            
                if (AudioListener.currentSpotifyState && nonZeroAudioData == false && AudioListener.currentSpotifyState.localTrack == false){
                    AudioListener.currentDFTEngineSamples.push([correctedAudioArray, SpotifyControllerv2.estimateTimePosition(AudioListener.currentSpotifyState)]);
                }

                this.transmissionServer.carelessAll("DFTResults", correctedAudioArray);
            }
        }, 1));

        let previousSongID = "";

        AudioListener.listeningIntervalProcess.push(setInterval(async () => {
            AudioListener.currentSpotifyState = await SpotifyControllerv2.getCurrentSpotifyState();

            if (AudioListener.currentSpotifyState.spotifyID != previousSongID){
                AudioListener.saveDFTEngineSamples(previousSongID);
                previousSongID = AudioListener.currentSpotifyState.spotifyID;
            }
        }, 25));

        AudioListener.audioListenerProcess = currentAudioStream;
    }

    static stopAudioListening(){
        if (AudioListener.audioListenerProcess){
            AudioListener.audioListenerProcess.kill();
            AudioListener.audioListenerProcess = null;
            for (let interval of AudioListener.listeningIntervalProcess){
                clearInterval(interval);
            }

            AudioListener.listeningIntervalProcess = [];

            if (AudioListener.currentSpotifyState)
                AudioListener.saveDFTEngineSamples(AudioListener.currentSpotifyState!.spotifyID);
        }
    }

    static clearDFTEngineSamples(){
        AudioListener.currentDFTEngineSamples = [];
    }

    static async obtainDFTCache(spotifyID: string){
        let dataIndex = AudioListener.dftLookupTable.get(spotifyID);

        if (dataIndex == undefined){
            return null;
        }else{
            let data;
            try{
                data = await AudioListener.database.readData(dataIndex);
                return JadeStruct.toObject(data.Buffer);
            }
            catch(er){
                AudioListener.dftLookupTable.delete(spotifyID);
                console.warn(`Failed to read the data for data index ${dataIndex}. Making a new recording...`);
                return null;
            }

        }
    }

    static async saveDFTEngineSamples(spotifyID: string){
        if (AudioListener.currentSpotifyState){
            let currentDFTEngineSamples = AudioListener.currentDFTEngineSamples;
            AudioListener.clearDFTEngineSamples();

            let dataIndex = AudioListener.dftLookupTable.get(spotifyID);

            let dftEngineAudioSample: DFTEngineAudioSample;

            if (dataIndex == undefined){
                dftEngineAudioSample = {
                    samples: [],
                    spotifyID: spotifyID,
                    recordedDuration: 0,
                    dateRecorded: new Date(),
                    dateStarted: new Date(),
                    dftEngineSource: "jade"
                }

                dataIndex = AudioListener.dftLookupTable.size + 1;
                AudioListener.dftLookupTable.set(spotifyID, dataIndex);
                console.log(`DFT Cache-Miss: ${spotifyID}. Saving to the database of size: ${AudioListener.dftLookupTable.size}`);
            }else{
                dftEngineAudioSample = JadeStruct.toObject((await AudioListener.database.readData(dataIndex)).Buffer);
            }

            dftEngineAudioSample.dateRecorded = new Date();

            dftEngineAudioSample.samples = dftEngineAudioSample.samples.concat(currentDFTEngineSamples);
            
            dftEngineAudioSample.samples.sort((a, b)=>a[1] - b[1]);

            let newSamplesList = [];

            if (dftEngineAudioSample.samples[0]){
                newSamplesList.push(dftEngineAudioSample.samples[0]);
            }

            for (let i = 1;i<dftEngineAudioSample.samples.length;i++){
                if ((dftEngineAudioSample.samples[i][1] - newSamplesList[newSamplesList.length - 1][1]) * 1000 > 5){
                    newSamplesList.push(dftEngineAudioSample.samples[i]);
                }
            }

            dftEngineAudioSample.samples = newSamplesList;

            await AudioListener.database.writeData(JadeStruct.toJadeStruct(dftEngineAudioSample).convertToNodeJSBuffer(), dataIndex, spotifyID);
            await AudioListener.saveLookupTable();
            console.log(`DFT Cached!: ${spotifyID} with sample size of ${newSamplesList.length}. Saving to the database of size: ${AudioListener.dftLookupTable.size}`);
        }
    }

    static async close(){
        await AudioListener.saveLookupTable();
        await AudioListener.database.close();
    }

    static async saveLookupTable(){
        await AudioListener.database.writeData(JadeStruct.toJadeStruct(AudioListener.dftLookupTable).convertToNodeJSBuffer(), 0, "Lookuptable");
    }

    static async loadLookupTable(){
        if (AudioListener.database.getArrayLength() == 0){
            await AudioListener.saveLookupTable();
            console.warn("Generated a new database system for DFT Engine Cache.");
        }else{
            AudioListener.dftLookupTable = JadeStruct.toObject((await AudioListener.database.readData(0)).Buffer);
            console.log(`Loaded a DFT Engine Cache Database with ${AudioListener.database.getArrayLength()} items.`)
        }
    }

    static async init(){
        await AudioListener.database.open();
        await AudioListener.loadLookupTable();
        
    }
}

export function justExit(){
    AudioListener.stopAudioListening();
}
console.bindToExit(AudioListener.stopAudioListening);

class JadeLyricsManager{

    static detailFactor = 10;
    static filePath = `${process.env.HOME}/Documents/Lyrics/`;
    
    static jadeLyricsPattern = /(?:waittill (\d*\.\d*);\necho -n \"(.*? )\")|(?:echo -n \"\n\[2K\")/;
    static jadeLyricsNamePattern = /# Jade's Lyrics Generator for the song (.*)\n/;
    static jadePropertiesPattern = /# Jade's Lyrics v2 Properties: (.*)\n/
    
    static hashedLyrics = new Map<String, JadeLyrics>();
    static parsedJadeLyrics: JadeLyrics[] = [];

    static init(){
        return new Promise<void>((accept, reject)=>{
            if (!FileSystem.existsSync(this.filePath)){
                console.warn("Making a new Lyrics Folder");
                FileSystem.mkdirSync(this.filePath);
            }
            FileSystem.readdir(this.filePath, (err, files)=>{
                if (err){
                    reject("An unknown error has occured when initializing...");
                    return null;
                }
                let due = 0;
                function complete(){
                    due --;
                    if (due == 0){
                        accept();
                        console.log("Finished parsing all Jade Lyrics!");
                    }
                }
                files.forEach(va=>{
                    due ++;
                    this.parseJadeLyricsFile(`${this.filePath}${va}`).then(jadeLyrics=>{
                        // console.log(`✅ "${jadeLyrics.trackName}" read as Jade Lyrics!`);
                        this.parsedJadeLyrics.push(jadeLyrics);
                        this.hashedLyrics.set(jadeLyrics.trackName.toLowerCase(), jadeLyrics);
                        complete();
                    }).catch(err=>{
                        console.warn(`❌ ${va} cannot be read as Jade Lyrics!\n\tDetails:${err}`);
                        complete();
                    });
                });
            });
        });
    }

    static parseJadeLyricsFile(file_path: FileSystem.PathLike){
        return new Promise<JadeLyrics>((accept, reject)=>{
            let jadeLyrics: JadeLyrics = {
                trackName: "",
                timeLength: 0,
                lyricalLinesTimeReferences: [],
                lyricalLines: []
            }
            FileSystem.readFile(file_path, {encoding: "utf-8"}, (err, va)=>{


                if (err){
                    reject(`An error has occured when reading "${file_path}"`);
                    return;
                }
                let nameMatch = va.match(this.jadeLyricsNamePattern);
                if (nameMatch == null){
                    reject(`This file "${file_path}" is corrupt or is not a Jade Lyrics file!`);
                    return;
                }
                
                va = va.replace(/е/g, "e");

                let properties = va.match(this.jadePropertiesPattern);

                let delay = 0;

                if (properties){
                    for (let property of properties[1].split(/;/)){
                        let propertyMatch = property.match(/(.+?)=(.+)/);
                        let propertyName = propertyMatch![1];
                        let propertyValue = propertyMatch![2];

                        switch(propertyName){
                            case "Delay":{
                                delay = Number(propertyValue);
                            }
                        }
                    }
                }
                
                jadeLyrics.trackName = nameMatch[1];
                
                let currentTime = delay;
                let newLined = false;

                let line: LyricalLine = {
                    line: "",
                    startTime: 0,
                    endTime: 0,
                    lyricalInstructions: [],
                    index: 0,
                    disapparenceThresholdTime: 10000000
                };
                line.startTime = currentTime;

                let compiledLines: LyricalLine[] = [];
                let compiledInstructions: LyricalInstruction[] = [];

                let disappearenceIndex = 0;
                let justAddedNewLine = false;
                let lyricalWords = va.match(new RegExp(this.jadeLyricsPattern, "g"));
                if (lyricalWords == null){
                    reject(null);
                    return;
                }
                lyricalWords.forEach(va=>{
                    let specificWordMatch = va.match(this.jadeLyricsPattern);
                    if (specificWordMatch == null){
                        reject("An unknown error has occured!")
                        return;
                    }
                    if (specificWordMatch[1] == null && specificWordMatch[2] == null){
                        newLined = true;
                        return;
                    }
                    currentTime = Number(specificWordMatch[1]) + delay;
                    if (newLined){
                        newLined = false;

                        line.lyricalInstructions = compiledInstructions;

                        justAddedNewLine = true;
                        line.endTime = currentTime;
                        compiledInstructions = [];
                        compiledLines.push(line);

                        line = {
                            line: "",
                            startTime: 0,
                            endTime: 0,
                            lyricalInstructions: [],
                            index: 0,
                            disapparenceThresholdTime: 10000000
                        };
                        line.startTime = currentTime;
                    }

                    if (justAddedNewLine){
                        justAddedNewLine = false;

                        let previousLine = compiledLines[compiledLines.length - 1];
                        let initialTime = previousLine.lyricalInstructions[previousLine.lyricalInstructions.length - 1].time;
                        let finalTime = currentTime;
                        if (finalTime - 0.865 - initialTime > 4.365){
                            for (let i = disappearenceIndex;i<compiledLines.length;i++){
                                compiledLines[i].disapparenceThresholdTime = initialTime + 4.365;
                            }
                            disappearenceIndex = compiledLines.length;
                        }
                    }

                    let word = specificWordMatch[2].replace(/\\\"/g, "\"");
                    line.line += word;

                    let lyricalInstruction: LyricalInstruction = {
                        newString: "",
                        time: 0
                    };
                    lyricalInstruction.newString = word;
                    lyricalInstruction.time = currentTime;
                    compiledInstructions.push(lyricalInstruction);
                });
                if (compiledLines.length == 0){
                    reject(null);
                    return;
                }

                line.lyricalInstructions = compiledInstructions;

                line.endTime = currentTime;
                compiledInstructions = [];
                compiledLines.push(line);

                line = {
                    line: "",
                    startTime: 0,
                    endTime: 0,
                    lyricalInstructions: [],
                    index: 0,
                    disapparenceThresholdTime: 10000000
                };
                line.startTime = currentTime;

                jadeLyrics.timeLength = currentTime + 4;
                jadeLyrics.lyricalLinesTimeReferences = [];
                jadeLyrics.lyricalLines = compiledLines;

                for (let i in compiledLines){
                    let selectedLine = compiledLines[i];
                    selectedLine.index = Number(i);
                    for (let time = Math.floor((selectedLine.startTime+0.5)*this.detailFactor);time<Math.floor(selectedLine.endTime+4)*this.detailFactor;time++){
                        jadeLyrics.lyricalLinesTimeReferences[time] = selectedLine;
                    }
                }
                accept(jadeLyrics);
            });
        });
    }
}

class StoringSystem{
    static imageLookupTable = new Map<string, number>();
    static loadingImages = new Map<string, boolean>();
    static database = new LowLevelJadeDB("./stores/spotifyImageCache.db", 16384);
    static emptyImage = Buffer.alloc(0);

    static obtainSpotifyImage(imageURL: string, name: string = "UNKNOWN"){

        return new Promise<Buffer>((accept, reject)=>{
            let location = StoringSystem.imageLookupTable.get(imageURL);
            
            if (imageURL == "missing value"){
                FileSystem.readFile(`./resources/altAlbums/${name}.jpg`, (error, buffer)=>{
                    if (error)
                        return FileSystem.readFile("./resources/GenericIcon.png", (error, buffer)=>{
                            accept(buffer);
                        })
                    accept(buffer);
                })
                return;
            }

            let fileURLMatch = imageURL.match(/file:\/\/(.+)/);

            if (fileURLMatch){
                FileSystem.readFile(fileURLMatch[1], (error, buffer)=>{
                    if (error)
                        return FileSystem.readFile("./resources/GenericIcon.png", (error, buffer)=>{
                            accept(buffer);
                        })
                    accept(buffer);
                });
                return;
            }

            if (StoringSystem.loadingImages.has(imageURL)){
                return accept(StoringSystem.emptyImage);
            }
    
            if (location == null){
                let newIndexLocation = StoringSystem.imageLookupTable.size + 1;
                StoringSystem.loadingImages.set(imageURL, true);
    
                let request = new Request(imageURL);
    
                console.log(`IMG Cache-Miss: ${imageURL}. Downloading and saving to the database of size: ${StoringSystem.imageLookupTable.size}`);

                fetch(request).then((response)=>{
                    response.arrayBuffer().then((array)=>{
    
                        let buffer = Buffer.from(array);
                        StoringSystem.database.writeData(buffer, newIndexLocation, name).then(()=>{
                            StoringSystem.loadingImages.delete(imageURL);
                            StoringSystem.imageLookupTable.set(imageURL, newIndexLocation);
                            StoringSystem.saveLookupTable();
                            console.log(`IMG Cached!: ${imageURL} to database of size ${StoringSystem.imageLookupTable.size}`);
                        });
                        accept(buffer);
                    });
                }).catch(()=>{
                    StoringSystem.loadingImages.delete(imageURL);
                    console.error("Image save failure. Loading is set to default.");
                });
            }else{
                StoringSystem.database.readData(location).then((results)=>{
                    accept(results.Buffer);
                }).catch((reason)=>{
                    console.error(reason);
                    StoringSystem.loadingImages.set(imageURL, true);
        
                    let request = new Request(imageURL);
        
                    fetch(request).then((response)=>{
                        response.arrayBuffer().then((array)=>{
        
                            let buffer = Buffer.from(array);
                            StoringSystem.database.writeData(buffer, location, name).then(()=>{
                                StoringSystem.loadingImages.delete(imageURL);
                                StoringSystem.imageLookupTable.set(imageURL, location);
                                StoringSystem.saveLookupTable();
                                // console.log(StoringSystem.database.ePointers);
                            });
                            accept(buffer);
                        });
                    }).catch(()=>{
                        StoringSystem.loadingImages.delete(imageURL);
                        console.error("Image save failure. Loading is set to default.");
                    });
                });
            }
        });
    };

    static saveLookupTable(){
        return new Promise<void>((accept)=>{
            let data = JadeStruct.toJadeStruct(StoringSystem.imageLookupTable).convertToNodeJSBuffer();
            StoringSystem.database.writeData(data, 0, "LookupTable").then(()=>StoringSystem.database.saveAllEpointers().then(accept));
        });
    }

    static loadLookupTable(){
        return new Promise<void>((accept)=>{
            if (StoringSystem.database.getArrayLength() == 0){
                StoringSystem.saveLookupTable();
                console.warn("Generated a new database system for Spotify Image Cache.");
            }else{
                StoringSystem.database.readData(0).then((data)=>{
                    console.log(`Loaded a Spotify Image Cache Database with ${StoringSystem.database.getArrayLength()} items.`)
                    let lookupTable = JadeStruct.toObject(data.Buffer);
                    StoringSystem.imageLookupTable = lookupTable as Map<string, number>;
                    accept();
                });
            }
        });
    }

    static async close(){
        await StoringSystem.database.close();
    }
 

    static init(){
        return new Promise<void>((accept)=>{
            console.log("Opening Spotify Image Cache Database...");
            StoringSystem.database.open().then(()=>{
                console.log("Loading Lookup table of Spotify Image Cache Database...");
                StoringSystem.loadLookupTable().then(()=>{
                    accept();
                });
            });
        });
    }
}

class SpotifyControllerv2{

    static currentState: "Playing" | "Played" | "Pausing" | "Paused" | "Transitioning" | "TransitionRepairing" | "Transitioned" | "TransitionCleaning" = "Paused";

    static currentFetchSpotifyState: SpotifyState | null = null;
    static timeSinceSpotifyStateFetch = 0;
    static fetchingSpotifyState = false;

    static spotifyInterface: DBusInterface;
    
    static spotifyResynced = false;
    static transitionFromFetchSpotifyState: SpotifyState | null = null;

    static estimateTimePosition(spotifyState: SpotifyState, overflowProtect = true){
        if (overflowProtect){
            return Math.min(spotifyState.timeLength, spotifyState.timePosition + (Date.now() - spotifyState.timeFeteched) / 1000);
        }else{
            return spotifyState.timePosition + (Date.now() - spotifyState.timeFeteched) / 1000;
        }
    }

    static processStateMachine(){

        let currentSpotifyState = SpotifyControllerv2.currentFetchSpotifyState;
        let outputSpotifyState: SpotifyState;
        
        if (currentSpotifyState == null){
            SpotifyControllerv2.currentState = "Paused";
            return;
        }

        let estimatedTimePosition = SpotifyControllerv2.estimateTimePosition(currentSpotifyState);

        switch(SpotifyControllerv2.currentState){
            case "Playing":{
                AudioListener.startAudioListening();
                SpotifyControllerv2.currentState = "Played";
            }
            case "Played":{
                if (currentSpotifyState.playState == false){
                    SpotifyControllerv2.currentState = "Pausing";
                }
                if (currentSpotifyState.timeLength > 5 && estimatedTimePosition > currentSpotifyState.timeLength - 3){
                    SpotifyControllerv2.currentState = "Transitioning";
                    SpotifyControllerv2.transitionFromFetchSpotifyState = SpotifyControllerv2.currentFetchSpotifyState;
                }

                outputSpotifyState = currentSpotifyState!;
                break;
            }
            case "Pausing":{
                AudioListener.stopAudioListening();
                SpotifyControllerv2.currentState = "Paused";
            }
            case "Paused":{
                if (currentSpotifyState.playState){
                    SpotifyControllerv2.currentState = "Playing";
                }

                outputSpotifyState = currentSpotifyState!;
                break;
            }
            case "Transitioning":{
                if (estimatedTimePosition < 2){
                    SpotifyControllerv2.currentState = "TransitionRepairing";
                }

                outputSpotifyState = SpotifyControllerv2.transitionFromFetchSpotifyState!;
                break;
            }
            case "TransitionRepairing":{
                SpotifyControllerv2.resyncSpotifyPlayback();
                SpotifyControllerv2.currentState = "Transitioned";

                outputSpotifyState = SpotifyControllerv2.transitionFromFetchSpotifyState!;
                break;
            }
            case "Transitioned":{
                let transitionedFromFetchSpotify = SpotifyControllerv2.transitionFromFetchSpotifyState!;

                let previousMediaEstimatedTimePosition = SpotifyControllerv2.estimateTimePosition(transitionedFromFetchSpotify!);

                if (previousMediaEstimatedTimePosition >= transitionedFromFetchSpotify.timeLength){
                    SpotifyControllerv2.currentState = "TransitionCleaning";
                }

                outputSpotifyState = SpotifyControllerv2.transitionFromFetchSpotifyState!;
                break;
            }
            case "TransitionCleaning":{
                let transitionedFromFetchSpotify = SpotifyControllerv2.transitionFromFetchSpotifyState!;
                
                if (SpotifyControllerv2.spotifyResynced == false){
                    SpotifyControllerv2.currentState = "Played";
                }

                outputSpotifyState = currentSpotifyState!;
                outputSpotifyState.playState = true;
                outputSpotifyState.timePosition = Math.max(0, SpotifyControllerv2.estimateTimePosition(transitionedFromFetchSpotify, false) - transitionedFromFetchSpotify.timeLength - 0.1);
                outputSpotifyState.timeFeteched = Date.now();
            }
        }

        return outputSpotifyState!;
    }

    static getCurrentSpotifyState(override: boolean = false){
        return new Promise<SpotifyState>((accept, reject)=>{

            let onFetchCallback = ()=>{
                let currentSpotifyState = SpotifyControllerv2.processStateMachine();
                if (currentSpotifyState){
                    accept(currentSpotifyState);
                }else{
                    console.warn("Spotify State Machine returned an invalid state.");
                    reject();
                }
            };

            if (Date.now() - SpotifyControllerv2.timeSinceSpotifyStateFetch > 50 || override){
                SpotifyControllerv2.timeSinceSpotifyStateFetch = Date.now();
                SpotifyControllerv2.fetchCurrentSpotifyState().then((spotifyState)=>{
                    SpotifyControllerv2.currentFetchSpotifyState = spotifyState;
                    onFetchCallback();
                }).catch((err)=>{
                    onFetchCallback();
                });
            }else{
                onFetchCallback();
            }
        });
    }

    static fetchCurrentSpotifyState(){
        return new Promise<SpotifyState>((accept, reject)=>{
            if (SpotifyControllerv2.fetchingSpotifyState){
                return reject("Cannot fetch state when already fetching...");
            }
            SpotifyControllerv2.fetchingSpotifyState = true;
                
            SpotifyControllerv2.dbusFetchCurrentSpotifyState().then((newSpotifyState)=>{
                SpotifyControllerv2.fetchingSpotifyState = false;
                StoringSystem.obtainSpotifyImage(newSpotifyState.artworkURL, newSpotifyState.trackName).then(()=>{
                    accept(newSpotifyState);
                });
            }).catch((er)=>{
                SpotifyControllerv2.fetchingSpotifyState = false;
                return reject("Unknown failure to fetch current spotify state.");
            });
        });
    }

    static resyncSpotifyPlayback(){
        SpotifyControllerv2.spotifyResynced = true;
        setTimeout(async () => {

            for (let i = 0;i<5;i++){
                await SpotifyControllerv2.pause();
                await SpotifyControllerv2.play();
                await new Promise(accept => {setTimeout(accept, 150)});
            }
            // await SpotifyControllerv2.seekTrack(0);
            await SpotifyControllerv2.play();
            setTimeout(() => {
                SpotifyControllerv2.getCurrentSpotifyState(true);
                SpotifyControllerv2.spotifyResynced = false;
            }, 100);
        }, 1500);
    };

    static dbusFetchCurrentSpotifyState(){
        return new Promise<SpotifyState>((accept, reject)=>{
            let completedTask = 0;
    
            let currentSpotifyState: SpotifyState = {
                playState: false,
                localTrack: false,
                timePosition: 0,
                timeLength: 0,
                artistName: "",
                trackName: "",
                artworkURL: "",
                spotifyID: "",
                albumName: "",
                loopStatus: "None",
                timeFeteched: 0,
                popularity: 0,
                trackNumber: 0,
                volume: 0
            };

            let completeTask = function(){
                completedTask ++;
                if (completedTask == 4){
                    return accept(currentSpotifyState);
                };
            };
    
            SpotifyControllerv2.spotifyInterface.getProperty("Metadata", (err, data: any)=>{
                if (err){
                    console.warn(`Trying to fetch from DBUS to Spotify but failed with: ${err.message}`);
                    // console.error(err);
                    return reject(err);
                }
    
                currentSpotifyState = {
                    playState: false,
                    localTrack: !!(data["mpris:trackid"] as string || "").match(/^\/com\/spotify\/local\//),
                    timePosition: 0,
                    timeLength: data["mpris:length"] / 1000000,
                    artistName: (data["xesam:artist"] as string[]).join(" & "),
                    trackName: data["xesam:title"],
                    artworkURL: data["mpris:artUrl"] || "missing value",
                    spotifyID: data["mpris:trackid"],
                    albumName: data["xesam:album"],
                    timeFeteched: Date.now(),
                    popularity: data["xesam:autoRating"],
                    trackNumber: data["xesam:trackNumber"],
                    loopStatus: "None",
                    volume: 0
                };
            
                SpotifyControllerv2.spotifyInterface.getProperty("Position", (err, data: any)=>{
                    if (err)
                        console.error(err);
                    currentSpotifyState.timePosition = data / 1000000;
                    completeTask();
                });

                SpotifyControllerv2.spotifyInterface.getProperty("LoopStatus", (err, data: any)=>{
                    if (err)
                        console.error(err);
                    currentSpotifyState.loopStatus = data;
                    completeTask();
                });
                
                SpotifyControllerv2.spotifyInterface.getProperty("PlaybackStatus", (err, data: any)=>{
                    if (err)
                        console.error(err);
                    currentSpotifyState.playState = data == "Playing";
                    completeTask();
                });
                
                SpotifyControllerv2.spotifyInterface.getProperty("Volume", (err, data: any)=>{
                    if (err)
                        console.error(err);
                    currentSpotifyState.volume = data;
                    completeTask();
                });
                
                completeTask();
            });
        });
    }

    static pausePlaySpotify(){
        return new Promise<void>(async (accept, reject)=>{
            await SpotifyControllerv2.playPause();
            accept();
        });
    }

    static pause(){
        return new Promise<void>((accept)=>{
            SpotifyControllerv2.spotifyInterface.Pause(accept);
        })
    }
    
    static play(){
        return new Promise<void>((accept)=>{
            SpotifyControllerv2.spotifyInterface.Play(accept);
        })
    }
    
    static nextTrack(){
        return new Promise<void>((accept)=>{
            SpotifyControllerv2.spotifyInterface.Next(accept);
        })
    }
    
    static previousTrack(){
        return new Promise<void>((accept)=>{
            SpotifyControllerv2.spotifyInterface.Previous(accept);
        })
    }

    static setLoopMode(loopMode: "None" | "Track" | "Playlist"){
        return new Promise<void>((accept)=>{
            SpotifyControllerv2.spotifyInterface.setProperty("LoopStatus", loopMode, ()=>{
                accept();
            });
        })
    }
    
    
    static playPause(){
        return new Promise<void>((accept)=>{
            SpotifyControllerv2.spotifyInterface.PlayPause(accept);
        })
    }
    
    static seekTrack(position: number){
        return new Promise<void>((accept)=>{
            let estimatedTimePosition = SpotifyControllerv2.estimateTimePosition(SpotifyControllerv2.currentFetchSpotifyState!);
            SpotifyControllerv2.spotifyInterface.Seek((position - estimatedTimePosition) * 1000000, accept);
        })
    }
    

    static init(){
        let bus = getBus("session");

        return new Promise<void>((accept)=>{
            console.log("Attempting to get interface...");
            bus.getInterface("org.mpris.MediaPlayer2.spotify", "/org/mpris/MediaPlayer2", "org.mpris.MediaPlayer2.Player", function(err, interf){
                SpotifyControllerv2.spotifyInterface = interf;
                console.log("Got interface!");
                accept();
            });
        });
    }
}

function main(){
    const expressServer = Express();
    const httpsServer = HTTP.createServer(expressServer);
    const transmissionServer = new TransmissionServer();

    httpsServer.listen(38495);
    console.log("Setup port at 38495");
    transmissionServer.listenHTTPServer(httpsServer);

    AudioListener.transmissionServer = transmissionServer;

    expressServer.use("/", Express.static("./resources"));

    let musicController = SpotifyControllerv2;

    transmissionServer.addEventListener("transmit", (transmission)=>{
        let controller = transmission.controller!;


        controller.listenMessage("GetCurrentSpotifyState", (request)=>{
            musicController.getCurrentSpotifyState().then((state)=>{
                request.accept!(state);
            }).catch(request.reject!);
        });

        controller.listenMessage("TogglePlaybackState", (request)=>{
            musicController.pausePlaySpotify().then(()=>{
                musicController.getCurrentSpotifyState(true).then(state=>request.accept!(state));
            }).catch(request.reject!);
        });

        controller.listenMessage("PreviousTrack", (request)=>{
            musicController.previousTrack().then(()=>{
                musicController.getCurrentSpotifyState(true).then(state=>request.accept!(state));
            }).catch(request.reject!);
        });

        controller.listenMessage("NextTrack", (request)=>{
            musicController.nextTrack().then(()=>{
                musicController.getCurrentSpotifyState(true).then(state=>request.accept!(state));
            }).catch(request.reject!);
        });

        controller.listenMessage("SeekTrack", (request, timePosition)=>{
            musicController.seekTrack(timePosition).then(()=>{
                musicController.getCurrentSpotifyState(true).then(state=>request.accept!(state));
            }).catch(request.reject!);
        });
        controller.listenMessage("SetLoopMode", (request, loopMode)=>{
            musicController.setLoopMode(loopMode).then(()=>{
                musicController.getCurrentSpotifyState(true).then(state=>request.accept!(state));
            }).catch(request.reject!);
        });
        controller.listenMessage("GetTime", (request)=>{
            request.accept!(Date.now());
        });

        controller.listenMessage("ObtainSpotifyImage", (request, url, albumName, spotifyID)=>{
            StoringSystem.obtainSpotifyImage(url, albumName).then(data=>{
                request.accept!(data.toString("base64"));
            }).catch(request.reject!);
            // StoringSystem.obtainAppleImage(spotifyID).then(data=>{
            //     request.accept!(data.toString("base64"));
            // }).catch(request.reject!);
        });

        controller.listenMessage("ObtainDFTCache", (request, spotifyID: string)=>{
            AudioListener.obtainDFTCache(spotifyID).then((cache)=>{
                request.accept!(cache);
            });
        });

        controller.listenMessage("ObtainJadeLyrics", (request, songName: string, albumName: string, artistName: string, spotifyID: string)=>{
            // albumName = (albumName.match(/(.+)(?: \(feat\. .+\))/) || ["", albumName])[1];
            // albumName = (albumName.match(/(.+)(?: - Single)/) || ["", albumName])[1];
            // artistName = artistName.split(/ \& /)[0];
            // songName = (songName.match(/(.+)(?: \(feat\. .+\))/) || ["", songName])[1];
            // console.log(songName, artistName, albumName);
            let jadeLyrics = 
                JadeLyricsManager.hashedLyrics.get(spotifyID.toLowerCase()) ||
                JadeLyricsManager.hashedLyrics.get(`${songName} of ${albumName} by ${artistName}`.toLowerCase()) ||
                JadeLyricsManager.hashedLyrics.get(`${songName} by ${artistName}`.toLowerCase()) ||
                JadeLyricsManager.hashedLyrics.get(songName.toLowerCase());
            request.accept!(jadeLyrics);
        });
    });

    let exiting = false;

    async function exit(){
        if (exiting){
            return;
        }
        exiting = true;
        console.log("Cleaning up...");
        await StoringSystem.close();
        await AudioListener.close();
        console.log("Done! Exiting...");
        process.exit(0);
    }

    console.bindToExit(exit);
}


export async function start(){
    console.setDebugLevel("enabled");
    // FileSystem.mkdirSync("./stores");
    console.time("Starting AudioListener...");
    await AudioListener.init();
    console.timeEnd("Starting AudioListener...");
    console.time("Starting StoringSystem...");
    await StoringSystem.init();
    console.timeEnd("Starting StoringSystem...");
    console.time("Starting SpotifyControllerv2...");
    await SpotifyControllerv2.init();
    console.timeEnd("Starting SpotifyControllerv2...");
    console.time("Starting Module Dependencies...");
    await attemptLoadModule();
    console.timeEnd("Starting Module Dependencies...");
    console.time("Starting JadeLyricssManager...");
    await JadeLyricsManager.init();
    console.timeEnd("Starting JadeLyricssManager...");
    console.log("Done!");
    console.setDebugLevel("disabled");
    main();
};

start();
