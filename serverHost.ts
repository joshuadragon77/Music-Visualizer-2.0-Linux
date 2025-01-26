import Express from "express";
import HTTP from "http";
import FileSystem from "fs";

import * as ChildProcess from "child_process";

import { SpotifyState } from "./modules/classes.js";

import * as console from "./modules/consolescript.js";
import { LowLevelJadeDB } from "./modules/jadestores.js";
import { TransmissionServer, attemptLoadModule, EventEmitter } from "./modules/transmission.js";
import { JadeStruct } from "./modules/jadestruct.js";
//import { connect, fetchCurrentSpotifyState, nextTrack, playPause, previousTrack, seekTrack } from "./modules/spotifylinux.js";

import { DBusInterface, getBus, registerService } from "dbus";

const bus = getBus("session");

// registerService("session", "dev.jades.MusicVisualizer2-0");

let spotifyInterface: DBusInterface;

export function connect(){
    return new Promise<void>((accept)=>{
        console.log("Attempting to get interface...");
        bus.getInterface("org.mpris.MediaPlayer2.playerctld", "/org/mpris/MediaPlayer2", "org.mpris.MediaPlayer2.Player", function(err, interf){
            spotifyInterface = interf;
            console.log("Got interface!");
            accept();
        });
    });
}

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
    timeFeteched: 0,
    popularity: 0,
    trackNumber: 0,
    volume: 0
};

let currentMediaSource: "Spotify" | "Unknown" = "Unknown";

export function pause(){
    spotifyInterface.Pause();
}

export function play(){
    spotifyInterface.Play();
}

export function nextTrack(){
    spotifyInterface.Next();
}

export function previousTrack(){
    spotifyInterface.Previous();
}

export function playPause(){
    spotifyInterface.PlayPause();
}

export function seekTrack(position: number){
    fetchCurrentSpotifyState().then(()=>{
        spotifyInterface.Seek((position - currentSpotifyState.timePosition) * (currentMediaSource == "Spotify" ? 1000000 : 1));
    })
}

export function fetchCurrentSpotifyState(){
    return new Promise<SpotifyState>((accept)=>{
        let completedTask = 0;

        let completeTask = function(){
            completedTask ++;
            if (completedTask == 3){
                if (currentMediaSource == "Spotify"){
                    currentSpotifyState.timeLength /= 1000000;
                    currentSpotifyState.timePosition /= 1000000;
                }
                return accept(currentSpotifyState);
            };
        };

        spotifyInterface.getProperty("Metadata", (err, data: any)=>{
            if (err)
                console.error(err);

            currentSpotifyState = {
                playState: false,
                localTrack: false,
                timePosition: 0,
                timeLength: data["mpris:length"],
                artistName: (data["xesam:artist"] as string[]).join(" & "),
                trackName: data["xesam:title"],
                artworkURL: data["mpris:artUrl"] || "missing value",
                spotifyID: data["mpris:trackid"],
                albumName: data["xesam:album"],
                timeFeteched: Date.now(),
                popularity: data["xesam:autoRating"],
                trackNumber: data["xesam:trackNumber"],
                volume: 0
            };

            currentMediaSource = !currentSpotifyState.spotifyID.match(/spotify/) ? "Unknown" : "Spotify";
        
            spotifyInterface.getProperty("Position", (err, data: any)=>{
                if (err)
                    console.error(err);
                currentSpotifyState.timePosition = data;
                completeTask();
            });
            
            spotifyInterface.getProperty("PlaybackStatus", (err, data: any)=>{
                if (err)
                    console.error(err);
                currentSpotifyState.playState = data == "Playing";
                completeTask();
            });
            
            // spotifyInterface.getProperty("Volume", (err, data: any)=>{
            //     if (err)
            //         console.error(err);
            //     currentSpotifyState.volume = data;
            //     completeTask();
            // });
            
            completeTask();
        });
    });
}



connect();



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

class AudioListener{

    static transmissionServer: TransmissionServer;

    static audioListenerProcess: ChildProcess.ChildProcessWithoutNullStreams | null = null;
    static currentLoudness = 0;
    static currentLoudnessArray: number[] = [];
    
    static startAudioListening(){
        if (AudioListener.audioListenerProcess)
            return;
        let currentAudioStream = ChildProcess.spawn("cava", ["-p", "cava.config"]);//ChildProcess.spawn("java", ["--enable-preview", "-jar", "AudioListener.jar"]);
        setInterval(()=>{
            let dataLength = 100;
            let data = currentAudioStream.stdout.read(dataLength);
            if (data != null){
                let rawAudioData = data.subarray(data.length-dataLength);
                let correctedAudio = "";
                let correctedAudioArray: Buffer = Buffer.alloc(100, 0);
                for (let i = 0;i<dataLength;i++){
                    AudioListener.currentLoudnessArray[i] = rawAudioData.readUInt8(i) / 255;
                    correctedAudio += String.fromCharCode(Math.round(Math.min(255, AudioListener.currentLoudnessArray[i] * 255)));
                    correctedAudioArray.writeUInt8(Math.round(Math.min(255, AudioListener.currentLoudnessArray[i] * 255)), i);
                }
                currentAudioStream.stdout.read(dataLength);

                this.transmissionServer.carelessAll("DFTResults", correctedAudioArray);
                
            }
        }, 1);
        AudioListener.audioListenerProcess = currentAudioStream;
    }
    static stopAudioListening(){
        if (AudioListener.audioListenerProcess){
            AudioListener.audioListenerProcess.kill();
            AudioListener.audioListenerProcess = null;
        }
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
                console.log("Making a new Lyrics Folder");
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
                        console.log(`✅ "${jadeLyrics.trackName}" read as Jade Lyrics!`);
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

                va = va.replace(/е/g, "e");

                if (err){
                    reject(`An error has occured when reading "${file_path}"`);
                    return;
                }
                let nameMatch = va.match(this.jadeLyricsNamePattern);
                if (nameMatch == null){
                    reject(`This file "${file_path}" is corrupt or is not a Jade Lyrics file!`);
                    return;
                }

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
                currentSpotifyState
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
                console.log(newIndexLocation);
                StoringSystem.loadingImages.set(imageURL, true);
    
                let request = new Request(imageURL);
    
                fetch(request).then((response)=>{
                    response.arrayBuffer().then((array)=>{
    
                        let buffer = Buffer.from(array);
                        StoringSystem.database.writeData(buffer, newIndexLocation, name).then(()=>{
                            StoringSystem.loadingImages.delete(imageURL);
                            StoringSystem.imageLookupTable.set(imageURL, newIndexLocation);
                            StoringSystem.saveLookupTable();
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
            }else{
                console.log(StoringSystem.database.ePointers);
                StoringSystem.database.readData(0).then((data)=>{
                    let lookupTable = JadeStruct.toObject(data.Buffer);
                    // console.log(lookupTable);
                    StoringSystem.imageLookupTable = lookupTable as Map<string, number>;
                    for (let i of StoringSystem.imageLookupTable.keys()){
                        // console.log(i + ": " + StoringSystem.imageLookupTable.get(i)!);
                    }
                    accept();
                });
            }
        });
    }

    static async close(){
        await StoringSystem.saveLookupTable();
        await StoringSystem.database.close();
    }

    static init(){
        StoringSystem.loadLookupTable();
    }
}

class SpotifyController{

    static fetchingSpotifyState = false;
    static timeSinceSpotifyStateFetch = 0;

    static adjustForSpotifyBug = false;
    static spotifyExperiencingBugs = false;

    static previouslyFetchedSpotifyState?: SpotifyState;

    static getCurrentSpotifyState(override = false){
        return new Promise<SpotifyState>((accept, reject)=>{
            if (Date.now() - SpotifyController.timeSinceSpotifyStateFetch > 50 || override){
                SpotifyController.timeSinceSpotifyStateFetch = Date.now();
                SpotifyController.fetchCurrentSpotifyState().then((spotifyState)=>{
                    accept(SpotifyController.previouslyFetchedSpotifyState = spotifyState);
                    SpotifyController.checkForSpotifyBug();
                }).catch((err)=>{
                    accept(SpotifyController.previouslyFetchedSpotifyState!);
                });
            }else{
                accept(SpotifyController.previouslyFetchedSpotifyState!);
            }
        });
    }

    static pausePlaySpotify(){
        return new Promise<void>((accept, reject)=>{
            playPause();
            accept();
        });
    }
    static previousTrack(){
        return new Promise<void>((accept, reject)=>{
            previousTrack();
            accept();
        });
    }
    static nextTrack(){
        return new Promise<void>((accept, reject)=>{
            nextTrack();
            accept();
        });
    }
    static seekTrack(position: number){
        return new Promise<void>((accept, reject)=>{
            seekTrack(position);
            accept();
        });
    }
    static fetchCurrentSpotifyState(){
        return new Promise<SpotifyState>((accept, reject)=>{
            if (SpotifyController.fetchingSpotifyState){
                return reject("Cannot fetch state when already fetching...");
            }
            SpotifyController.fetchingSpotifyState = true;
                
            fetchCurrentSpotifyState().then((newSpotifyState)=>{
                SpotifyController.fetchingSpotifyState = false;
                if (newSpotifyState.playState){
                    AudioListener.startAudioListening();
                }else{
                    AudioListener.stopAudioListening();
                }
                StoringSystem.obtainSpotifyImage(newSpotifyState.artworkURL, newSpotifyState.trackName).then(()=>{
                    accept(newSpotifyState);
                });
            });
        });
    }
    
    static checkForSpotifyBug(){
        if (SpotifyController.previouslyFetchedSpotifyState == null)
            return;
        
        if (SpotifyController.previouslyFetchedSpotifyState.timePosition > SpotifyController.previouslyFetchedSpotifyState.timeLength - 3){
            SpotifyController.adjustForSpotifyBug = true;
        }
        if (SpotifyController.adjustForSpotifyBug && SpotifyController.previouslyFetchedSpotifyState.timePosition < 3){
            SpotifyController.adjustForSpotifyBug = false;
            if (currentMediaSource == "Spotify"){
                //Spotify is gey and is broken
                setTimeout(async () => {
                    SpotifyController.pausePlaySpotify();
                    await new Promise(accept => {setTimeout(accept, 5)})
                    SpotifyController.pausePlaySpotify();
                    await new Promise(accept => {setTimeout(accept, 300)})
                    SpotifyController.pausePlaySpotify();
                    await new Promise(accept => {setTimeout(accept, 5)})
                    SpotifyController.pausePlaySpotify();
                    await new Promise(accept => {setTimeout(accept, 300)})
                    SpotifyController.pausePlaySpotify();
                    await new Promise(accept => {setTimeout(accept, 5)})
                    SpotifyController.pausePlaySpotify();
                    await new Promise(accept => {setTimeout(accept, 300)})
                    SpotifyController.pausePlaySpotify();
                    await new Promise(accept => {setTimeout(accept, 5)})
                    SpotifyController.pausePlaySpotify();
                    setTimeout(() => {
                        SpotifyController.getCurrentSpotifyState(true);
                    }, 100);
                }, 1000);
            }
        }
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

    transmissionServer.addEventListener("transmit", (transmission)=>{
        let controller = transmission.controller!;

        let musicController = SpotifyController;

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
        console.log("Done! Exiting...");
        process.exit(0);
    }

    console.bindToExit(exit);
}


export async function start(){
    // FileSystem.mkdirSync("./stores");
    console.log("Connecting to Spotify DBUS");
    await connect();
    console.log("Loading Images...");
    await StoringSystem.database.open();
    console.log("Opened Image Database..., Loading Images...");
    StoringSystem.init();
    console.log("Loading Modules...");
    await attemptLoadModule();
    console.log("Loading Jade Lyrics...");
    await JadeLyricsManager.init();
    console.log("Done!");
    main();
};

start();