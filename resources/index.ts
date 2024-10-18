import { Transmission } from "./modules/transmission.js";
import { Color, ColorMixer, ImageDrawer, WrapEngine, ObtainableImage } from "./modules/art.js";
import { JadeStruct, Buffer_JADEPORTED } from "./modules/jadestruct.js";
import { SpotifyState } from "./modules/classes.js";

const canvas = document.querySelector("canvas")!;
const context2D = canvas.getContext("2d")!;

type Parameters = {
    relevancyLevel: number
    sampleSize: number
    vibranceLevel: number
    ignoranceOfCommonality: number
    smallSampleLevel: number
    greyScaleLevel: number
    uniqueLevel: number
    brightnessLevel: number
    darknessLevel: number
};

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

class Images{
    static overlay = new ObtainableImage("./imageOverlay.png");
    static imageOverler = new OffscreenCanvas(640, 640);
}

type LyricalState = {
    completedLine: string;
    mainLine: string;
    historicalLines: string[];
    futureLine: string;

    lineStartTime: number;
    wordEndTime: number;
    lineEndTime: number;
    wordStartTime: number;

    currentWordStartTime: number;
    currentWordEndTime: number;

    lineProgresPercentage: number;

    endOfLyrics: boolean;
}

class LyricalPlayer{
    static detailFactor = 10;
    static initialLyricalTiming = 0.2;

    static getLyricalState(jadeLyrics: JadeLyrics, timePosition: number){
        timePosition += this.initialLyricalTiming;
        timePosition = Math.max(Math.min(timePosition, jadeLyrics.timeLength-2), 0);

        let currentTimeIndex = Math.floor((timePosition + 0.5) * this.detailFactor);
        let nearestLyricalLine = jadeLyrics.lyricalLinesTimeReferences[currentTimeIndex];
        
        if (nearestLyricalLine.endTime < timePosition){
            currentTimeIndex ++;
        }else
            if (nearestLyricalLine.startTime > timePosition){
                currentTimeIndex --;
            }

        currentTimeIndex = Math.min(Math.max(currentTimeIndex, 0), jadeLyrics.lyricalLinesTimeReferences.length-1);

        let lyricalLine = jadeLyrics.lyricalLinesTimeReferences[currentTimeIndex];

        if (lyricalLine.disapparenceThresholdTime < timePosition){
            lyricalLine = jadeLyrics.lyricalLines[Math.min(lyricalLine.index + 1, jadeLyrics.lyricalLines.length-1)];
        }

        let newLineLine;
        while (lyricalLine.line == " " && lyricalLine.index > 0){
            newLineLine = lyricalLine;
            lyricalLine = jadeLyrics.lyricalLines[Math.max(0, lyricalLine.index-1)];
        }
        
        let currentIndex = lyricalLine.index;

        let lyricalState: LyricalState = {
            completedLine: "",
            mainLine: "",
            historicalLines: [""],
            futureLine: "",
            lineStartTime: 0,
            wordEndTime: 0,
            lineEndTime: 0,
            wordStartTime: 0,
            currentWordStartTime: 0,
            currentWordEndTime: 0,
            lineProgresPercentage: 0,
            endOfLyrics: false
        };
        if (currentIndex < jadeLyrics.lyricalLines.length-1){
            let potentialFutureLineIndex = currentIndex + 1;
            while (jadeLyrics.lyricalLines[potentialFutureLineIndex ++].line == " " && potentialFutureLineIndex < jadeLyrics.lyricalLines.length);
            let futureLine = jadeLyrics.lyricalLines[potentialFutureLineIndex - 1];
            if (futureLine.disapparenceThresholdTime == lyricalLine.disapparenceThresholdTime)
                lyricalState.futureLine = futureLine.line;
        }else{
            lyricalState.endOfLyrics = true;
        }

        let currentLyricalInstruction = lyricalLine.lyricalInstructions.length - 1;
        let endTime = lyricalLine.endTime;
        for (let i = 1;i<lyricalLine.lyricalInstructions.length;i++){
            let futureInstruction = lyricalLine.lyricalInstructions[i];
            let instruction = lyricalLine.lyricalInstructions[i-1];
            if (futureInstruction.time < timePosition - this.initialLyricalTiming){
                lyricalState.completedLine += instruction.newString;
            }else{
                currentLyricalInstruction = i - 1;
                endTime = futureInstruction.time;
                break;
            }
        }
        if (currentLyricalInstruction + 1 == lyricalLine.lyricalInstructions.length - 1)
            endTime -= this.initialLyricalTiming/2;

        let currentInstruction = lyricalLine.lyricalInstructions[currentLyricalInstruction];

        if (timePosition < lyricalLine.disapparenceThresholdTime){
            lyricalState.mainLine = lyricalLine.line;
            if (currentInstruction.time < timePosition - this.initialLyricalTiming){
                if (lyricalState.endOfLyrics && currentLyricalInstruction == lyricalLine.lyricalInstructions.length - 1){
                    endTime += 1;
                }

                if (currentLyricalInstruction == lyricalLine.lyricalInstructions.length - 1){
                    endTime -= .2;
                }
                let startTime = currentInstruction.time;
                endTime = Math.min(Math.max(startTime+.2, endTime), startTime+2);

                let timeFactor = Math.min(1, (timePosition - this.initialLyricalTiming -startTime)/(endTime-startTime));

                lyricalState.currentWordStartTime = startTime;
                lyricalState.currentWordEndTime = endTime;

                let factor = //Math.pow(4*Math.pow(timeFactor - 0.5, 3) + 0.5, 1/3.0);
                    1 - Math.pow(1 - timeFactor, 2);

                if ((currentInstruction.newString.match(/[-.]/g) || []).length >= 3){
                    factor = timeFactor
                }

                lyricalState.lineProgresPercentage = (lyricalState.completedLine.length - 1)/lyricalState.mainLine.length + factor *(currentInstruction.newString.length)/lyricalState.mainLine.length;

                lyricalState.completedLine += currentInstruction.newString.substring(0, Math.floor(factor*(currentInstruction.newString.length+0.5)));
            }
        }else{
            lyricalState.completedLine = "";
        }
        
        let currentHistoricalLineIndex = currentIndex - 1;
        while (currentHistoricalLineIndex >= 0 && lyricalState.historicalLines.length < 10){
            let ls = jadeLyrics.lyricalLines[currentHistoricalLineIndex];

            if (ls.disapparenceThresholdTime > timePosition)
                if (ls.line != " ")
                    lyricalState.historicalLines.push(ls.line);

            currentHistoricalLineIndex --;
        }
        for (let i = lyricalState.historicalLines.length;i<11;i++){
            lyricalState.historicalLines.push("");
        }
        lyricalState.historicalLines.reverse();

        lyricalState.lineStartTime = lyricalLine.startTime - this.initialLyricalTiming;
        lyricalState.lineEndTime = lyricalLine.endTime - this.initialLyricalTiming;
        lyricalState.wordEndTime = lyricalLine.lyricalInstructions[lyricalLine.lyricalInstructions.length-1].time - this.initialLyricalTiming;
        lyricalState.wordStartTime = lyricalLine.lyricalInstructions[0].time - this.initialLyricalTiming;
        if (newLineLine){
            lyricalState.lineEndTime = newLineLine.endTime - this.initialLyricalTiming;
            if (timePosition > lyricalLine.disapparenceThresholdTime){
                lyricalState.wordStartTime = jadeLyrics.lyricalLines[Math.min(jadeLyrics.lyricalLines.length - 1, lyricalLine.index+1)].lyricalInstructions[0].time - this.initialLyricalTiming;
            }
        }

        return lyricalState;
    }
}

class DynamicPrimaryColorEngine{

    static offscreenCanvas = new OffscreenCanvas(1, 1);

    static measureGreyLevel(c: Color){
        return (1 - Math.min(1, Math.abs(c.r - c.g)/127.0)) * (1 - Math.min(1, Math.abs(c.r - c.b)/127.0));
    }
    static measureRelvance(c1: Color, c2: Color){
        return (1 - Math.min(1, Math.abs(c1.r - c2.r)/255.0)) *
            (1 - Math.min(1, Math.abs(c1.g - c2.g)/255.0)) *
            (1 - Math.min(1, Math.abs(c1.b - c2.b)/255.0));
    }
    static measureVibrance(c: Color){
        return Math.max(Math.max(c.b, c.g), c.r)/255.0 * (1 - c.b/255.0 * c.g/255.0 * c.r/255.0);
    }
    static measureBrightness(c: Color){
        return (c.r + c.b + c.g)/3.0/255;
    }

    static measureColorOpposition(c1: Color, c2: Color){
        return DynamicPrimaryColorEngine.measureRelvance(
            c1, new Color(
                255 - c2.r,
                255 - c2.g,
                255 - c2.b
            )
        );
    }

    static foregroundParameter: Parameters = {
        relevancyLevel: 0.810536892101989,
        sampleSize: 35 + 10,
        vibranceLevel: 15.074702546038452,
        ignoranceOfCommonality: 3.6437789828167393,
        smallSampleLevel: 13.66534402820978,
        greyScaleLevel: 11.77614577819662,
        uniqueLevel: 2.6740286539562677,
        brightnessLevel: -0.5126769043144241,
        darknessLevel: -4.424771864999498
    }
    static backgroundParameters: Parameters = {
        relevancyLevel: 0.7900542435600248,
        sampleSize: 76,
        vibranceLevel: -12.277206152130615,
        ignoranceOfCommonality: 393.96405899603724,
        smallSampleLevel: -305.14984595844174,
        greyScaleLevel: -75.26089868800373,
        uniqueLevel: 90.53390395061945,
        brightnessLevel: -129.49539217246766,
        darknessLevel: -91.45155112355047,
    };


    static getPrimaryColors(pixelHarvestingMethod: (x: number, y: number)=>(Color), width: number, height: number, parameters: Parameters){
        class ColorArrange{
            color = new Color(255, 255, 255);
            counts = 0;
        }
        let colorArrangement = [];

        let uniqueColors = 0;

        for (let x = 0;x<parameters.sampleSize;x++){
            for (let y = 0;y<parameters.sampleSize;y++){
                let color = pixelHarvestingMethod(x*width/parameters.sampleSize, y*height/parameters.sampleSize);
                if (color == null)
                    continue;
                let colorA = color;

                let match = false;

                for (let i = 0;i<colorArrangement.length;i++){
                    let ca = colorArrangement[i];
                    if (DynamicPrimaryColorEngine.measureRelvance(ca.color, colorA) > parameters.relevancyLevel){
                        match = true;
                        ca.counts ++;
                        break;
                    }
                }
                if (match == false){
                    let ca = new ColorArrange();
                    colorArrangement.push(ca);
                    ca.color = colorA;
                    ca.counts = 1;
                    uniqueColors ++;
                }
            }
        }

        type ColorCharacteristics = {
            color: Color,
            counts: number,
            fitness: number
        }

        let fitness = 0;
        let selectedColor: ColorCharacteristics = {
            color: new Color(255, 255, 255),
            counts: 0,
            fitness: 0
        };


        let newArrangement: ColorCharacteristics[] = [];

        for (let i = 0;i<uniqueColors;i++){
            let ca = colorArrangement[i];
            
            let currentFitness = Math.pow(1.5 - DynamicPrimaryColorEngine.measureBrightness(ca.color), parameters.darknessLevel) * Math.pow(DynamicPrimaryColorEngine.measureBrightness(ca.color), parameters.brightnessLevel) * Math.pow(1 - DynamicPrimaryColorEngine.measureGreyLevel(ca.color), parameters.greyScaleLevel) * Math.pow(DynamicPrimaryColorEngine.measureVibrance(ca.color) * Math.pow(1 - uniqueColors/150, parameters.uniqueLevel), parameters.vibranceLevel) 
                * Math.pow(ca.counts/parameters.sampleSize/parameters.sampleSize, parameters.ignoranceOfCommonality) * (Math.pow(1 - ca.counts/parameters.sampleSize/parameters.sampleSize, parameters.smallSampleLevel));
            //System.out.println((char)27 + String.format("[48;2;%d;%d;%dm", ca.color.getRed(), ca.color.getGreen(), ca.color.getBlue()) + ca.color.toString() + ", " + currentFitness);

            newArrangement.push({
                color: ca.color,
                fitness: currentFitness,
                counts: ca.counts
            });
            if (currentFitness > fitness){
                selectedColor = {
                    color: ca.color,
                    fitness: currentFitness,
                    counts: ca.counts
                };
                fitness = currentFitness;
            }
        }

        //System.out.println((char)27 + String.format("[48;2;%d;%d;%dm", selectedColor.getRed(), selectedColor.getGreen(), selectedColor.getBlue()) + selectedColor.toString());

        let colors: ColorCharacteristics[] = [selectedColor];
        newArrangement.sort((a, b)=>b.fitness - a.fitness);

        for (let cc of newArrangement){
            if (cc.color == selectedColor.color){
                continue;
            }
            colors.push(cc);
        }


        return colors;
    };

    static processImageUsingAlgorithm(image: HTMLImageElement, width: number, height: number){
        DynamicPrimaryColorEngine.offscreenCanvas.width = width;
        DynamicPrimaryColorEngine.offscreenCanvas.height = height;

        let context2D = DynamicPrimaryColorEngine.offscreenCanvas.getContext("2d")!;

        context2D.drawImage(image, 0, 0);

        let compiledImageData = context2D.getImageData(0, 0, width, height).data!;

        function harvestFunction(x: number, y: number){

            // properlly optimized for chromium based browsers
            let index = (Math.floor(x) + Math.floor(y) * width) * 4;

            return new Color(
                compiledImageData.at(index)!,
                compiledImageData.at(index + 1)!,
                compiledImageData.at(index + 2)!,
                compiledImageData.at(index + 3)!
            );

            // let data = context2D.getImageData(Math.round(x), Math.round(y), 1, 1).data;
            // return new Color(data[0], data[1], data[2]);
        }

        let foregroundColor = DynamicPrimaryColorEngine.getPrimaryColors(harvestFunction, width, height, DynamicPrimaryColorEngine.foregroundParameter);
        let backgroundColor = DynamicPrimaryColorEngine.getPrimaryColors(harvestFunction, width, height, DynamicPrimaryColorEngine.backgroundParameters);

        return {
            foregroundColor,
            backgroundColor,
        }
    }
}

class AnimationTween{
    static simpleExponential(x: number){
        return Math.pow(x, 2);
    }
    static fuckYouWhore(x: number){
        return (1 + Math.sin(11 * Math.PI * (x + 0.5))) / 2;
    }
    static jadeTween(x: number){
        // x = AnimationTween.fuckYouWhore(x);
        return ((x - 0.4) * (x - 1.4) * (x - 2.4) + 1.344) / 1.68;
    }
    static exponential(x: number){
        return 1 - Math.pow(1 - x, 3);
    }
    static bounce(x: number){
        return Math.sin(x * Math.PI);
    }
    static cos(x: number){
        return (- Math.cos(x * Math.PI) + 1) / 2;
    }
}

class Formatters{
    static toTime(time: number){
        time = Math.floor(time);
        return `${Math.floor(time/60)}:${time%60 < 10 ? `0${time%60}` : time%60}`;
    }
}

class TimingState{
    static timeSinceTrackChange = 0;
    static timeSinceLastFrame = 0;
    static timeSinceJadeLyricsLoaded = 0;
    static timeSinceDisplayModeChange = 0;
}


class DrawingRunTime{

    static backgroundColor = new Color(0, 170, 255);
    static foregroundColor = new Color(0, 170, 255);

    static foregroundColorPallete: Color[] = [];

    static backgroundCanvas = new OffscreenCanvas(1920 / 2, 1080 / 2);

    static bundleRandomness = (()=>{
        let array = [];

        for (let i = 0;i<200;i++){
            array.push(Math.random());
        }

        return array;
    })();

    static previousForegroundColor = new Color(0, 170, 255);
    static previousBackgroundColor = new Color(0, 170, 255);

    static currentWordDuration = 0;
    static previousWordDuration = 0;
    static timeSinceWordDurationChange = 0;

    static timeSinceSublineChange = 0;
    static showingSubline = false;

    static characterTiming: number[] = [];
    static previousTimingState = 0;

    static displayMode: "Landscape" | "Portrait" = "Landscape";

    static currentAction: "Pause" | "Play" | "Previous Track" | "Skip Track" = "Skip Track";
    static timeSinceCurrentAction = 0;

    static averageFrameRate = 0;

    static timeSinceTrackSwitchAction = 0;
    static trackSwitchAction: "left" | "right" = "left";

    static frameRateHistory: number[] = [];
    static timeSinceFrameRateSample = Date.now();

    static renderObjects = {
        AlbumCover: {
            x: 250,
            y: 250,
            width: 250,
            height: 250,
            renderProfile: {
                xScale: 1,
                yScale: 1,
                rotation: 0,
                xOffset: 0,
                yOffset: 0,
                imageRenderStyle: "old" as "old" | "current" | "previous" 
            },
            imageTransitionFactor: 0,
            image: undefined as ImageBitmap | undefined,
            blurredImage: undefined as ImageBitmap | undefined,
            previousImage: undefined as ImageBitmap | undefined
        },
        SongTitle: {
            x: 250,
            y: 250,
            timeSinceScroll: 0,
            scrollPosition: 0,
            textWidth: 100,
            scrollDurationMaximum: 1000,
            maxWidth: 100,
            text: "phases",
        },
        SongAlbum: {
            x: 250,
            y: 250,
            timeSinceScroll: 0,
            scrollPosition: 0,
            textWidth: 100,
            scrollDurationMaximum: 1000,
            maxWidth: 100,
            text: "phases",
        },
        SongArtist: {
            x: 250,
            y: 250,
            timeSinceScroll: 0,
            scrollPosition: 0,
            textWidth: 100,
            scrollDurationMaximum: 1000,
            maxWidth: 100,
            text: "phases",
        },
        ControlBar: {
            x: 250,
            y: 500,
            width: 500,
            height: 50,
            xOffset: 0,
            timePatternBoxWidth: 0,
            timeStringWidth: 0,
            timeString: "",
            extraString: "",
            currentExtraString: "",
            previousExtraString: "",
            timeLengthString: "",
            currentFlooredTime: 0,
            timeLengthStringWidth: 0,
            previousTimeString: "",
            timeSinceLeftBoxShake: -1,
            timeSinceRightBoxShake: -1,
            progressBar: 0,
            subSecondProgressBar: 0,
            playing: true,
            timeSinceStateChange: Date.now(),
            timePositionDragElement: {
                raw: {
                    x: 0,
                    y: 0,
                    active: false
                },
                timeSinceActive: 0,
                animationFactor: 1,
                active: false,
                currentTimePositionFactor: 0,
                currentTimePosition: 0,

                timeSinceSpotifyTimeChange: 0,
                previousSpotifyPositionX: 0,
                anchorSpotifyPositionX: 0,

            }
        },
        SongContent: {
            x: 0,
            y: 0,
            width: 0,
            height: 400,
            previousHeight: 0,
            timeSinceJadeLyricsShow: 0,
            showJadeLyrics: false
        },
        DFTContent: {
            x: 0,
            y: 0,
            width: 0,
            height: 200,
            enabled: true,
            timeSinceEnabled: Date.now(),
            timeSinceAudio: Date.now(),
            previousAudioSample: [] as number[],
            currentAudioSample: [] as number[],
            rawAudioSample: [] as number[],
            samples: 0,
            timeSinceAudioSample: 0,
        }
    }

    static maxWidth = 0;
    static maxHeight = 0;

    static frameRate = 75;
    static intervalFrameDelay = 0;
    static averageRenderTime = 0;
    static averageCalculationTime = 0;

    static safariBackgroundColor = new Color(255, 255, 255);

    static produceMinuteShakes(index: number){
        let timeScale = Date.now();
        
        return Math.floor(4 * Math.pow(DrawingRunTime.renderObjects.DFTContent.currentAudioSample[0] || 0, 2) * Math.cos(index + timeScale / 500)
         + 6 * Math.pow(DrawingRunTime.renderObjects.DFTContent.currentAudioSample[2] || 0, 2) * Math.cos(index + timeScale / 50)
         + 3 * Math.pow(DrawingRunTime.renderObjects.DFTContent.currentAudioSample[5] || 0, 2) * Math.cos(index + timeScale / 250)) * 
            (BackgroundTasks.jadeLyricsSupported ? 0.35 : 1.25);
    }

    static render(){
        let frameInterval = 1000 / DrawingRunTime.frameRate;

        DrawingRunTime.intervalFrameDelay = Date.now() - TimingState.timeSinceLastFrame;
        TimingState.timeSinceLastFrame = Date.now();
        //MATH

        let startCalculationTime = Date.now();

        let maxWidth = DrawingRunTime.maxWidth;
        let maxHeight = DrawingRunTime.maxHeight;

        let backgroundColor = DrawingRunTime.previousBackgroundColor;
        let foregroundColor = DrawingRunTime.previousForegroundColor;
        let textColor = new Color(255, 255, 255);

        let currentTimePositionFactor = 0;

        {
            if (BackgroundTasks.currentSpotifyState){
                let currentSpotfiyState = BackgroundTasks.currentSpotifyState;

                currentTimePositionFactor = Math.min(1, (currentSpotfiyState.timePosition + (Date.now() - currentSpotfiyState.timeFeteched) / 1000) / currentSpotfiyState.timeLength);
            }
        }

        {
            let timeFactor = Math.min(1, (Date.now() - TimingState.timeSinceTrackChange) / 2000);
            let animationFactor = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor));
            
            let timeFactor2 = Math.min(1, (Date.now() - DrawingRunTime.timeSinceSublineChange) / 1500);
            let animationFactor2 = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor2));

            if (DrawingRunTime.showingSubline == false){
                animationFactor2 = 1 - animationFactor2;
            }

            let tPDE = DrawingRunTime.renderObjects.ControlBar.timePositionDragElement;

            animationFactor2 *= (1 - tPDE.animationFactor);


            let actualForegroundColor = ColorMixer.lerp(DrawingRunTime.foregroundColor, DrawingRunTime.backgroundColor, animationFactor2);
            let actualBackgroundColor = ColorMixer.lerp(DrawingRunTime.backgroundColor, DrawingRunTime.foregroundColor, animationFactor2);

            let previousForegroundColor = ColorMixer.lerp(DrawingRunTime.previousForegroundColor, DrawingRunTime.previousBackgroundColor, animationFactor2);
            let previousBackgroundColor = ColorMixer.lerp(DrawingRunTime.previousBackgroundColor, DrawingRunTime.previousForegroundColor, animationFactor2);

            let previousTextColor = (()=>{
                let foregroundColor = previousForegroundColor;
                let backgroundColor = previousBackgroundColor;
                let textColor = new Color(255, 255, 255);
                {
                    textColor = foregroundColor;
                    // if (DynamicPrimaryColorEngine.measureRelvance(textColor, backgroundColor) > 0.6)
                    //     if (DynamicPrimaryColorEngine.measureBrightness(backgroundColor) > 0.5){
                    //         textColor = new Color(0, 0, 0);
                    //     }else{
                    //         textColor = new Color(255, 255, 255);
                    //     }
                }
                return textColor;
            })();

            let newTextColor = (()=>{
                let foregroundColor = actualForegroundColor;
                let backgroundColor = actualBackgroundColor;
                let textColor = new Color(255, 255, 255);
                {
                    textColor = foregroundColor;
                    // if (DynamicPrimaryColorEngine.measureRelvance(textColor, backgroundColor) > 0.6)
                    //     if (DynamicPrimaryColorEngine.measureBrightness(backgroundColor) > 0.5){
                    //         textColor = new Color(0, 0, 0);
                    //     }else{
                    //         textColor = new Color(255, 255, 255);
                    //     }
                }
                return textColor;
            })();


            backgroundColor = ColorMixer.lerp(previousBackgroundColor, actualBackgroundColor, animationFactor);
            foregroundColor = ColorMixer.lerp(previousForegroundColor, actualForegroundColor, animationFactor);
            textColor = ColorMixer.lerp(previousTextColor, newTextColor, animationFactor);

            let dftContent = DrawingRunTime.renderObjects.DFTContent;

            let timeFactor3 = Math.min(1, (Date.now() - dftContent.timeSinceAudioSample) / 75);
            let animationFactor3 = timeFactor3;
            let previousLoudness = dftContent.previousAudioSample[0] || 0;
            let currentLoudness = dftContent.currentAudioSample[0] || 0;

            let loudness = previousLoudness + (currentLoudness - previousLoudness) * animationFactor3;

            
            backgroundColor = ColorMixer.lerp(backgroundColor, ColorMixer.brighten(ColorMixer.lerp(backgroundColor, foregroundColor, .5)), Math.pow(loudness, 2) * (BackgroundTasks.jadeLyricsSupported ? 0.5 : 1))

            DrawingRunTime.safariBackgroundColor = backgroundColor;

        }

        {
            let aCP = DrawingRunTime.renderObjects.AlbumCover;
            let sCP = DrawingRunTime.renderObjects.SongContent;
            let dCP = DrawingRunTime.renderObjects.DFTContent;
            let timeFactor = Math.min(1, (Date.now() - TimingState.timeSinceDisplayModeChange) / 1000);
            let animationFactor = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor));

            let timeFactor2 = Math.min(1, (Date.now() - TimingState.timeSinceTrackChange) / 1000);
            let animationFactor2 = AnimationTween.bounce(AnimationTween.exponential(timeFactor2));
            
            let timeFactor3 = Math.min(1, (Date.now() - TimingState.timeSinceTrackChange) / 1000);
            let animationFactor3 = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor3));
            
            aCP.imageTransitionFactor = animationFactor3;

            let imagePortraitSize = Math.min(maxHeight - maxWidth * 0.125 - 325 - sCP.height - dCP.height - 30, maxWidth * 0.75);

            let landscapePosition = {
                x: maxWidth / 2 - imagePortraitSize / 2,
                y: maxWidth * 0.125 + 50,
                width: imagePortraitSize,
                height: imagePortraitSize
            }

            

            let portraitPosition = {
                x: maxWidth * 0.1,
                y: (maxHeight - 400) / 2  - sCP.height / 2 - 15,
                width: 400,
                height: 400
            };

            aCP.x = portraitPosition.x + (landscapePosition.x - portraitPosition.x) * (DrawingRunTime.displayMode == "Landscape" ?  1 - animationFactor : animationFactor);
            aCP.y = portraitPosition.y + (landscapePosition.y - portraitPosition.y) * (DrawingRunTime.displayMode == "Landscape" ?  1 - animationFactor : animationFactor);
            aCP.width = portraitPosition.width + (landscapePosition.width - portraitPosition.width) * (DrawingRunTime.displayMode == "Landscape" ?  1 - animationFactor : animationFactor);
            aCP.height = portraitPosition.height + (landscapePosition.height - portraitPosition.height) * (DrawingRunTime.displayMode == "Landscape" ?  1 - animationFactor : animationFactor);

            if (DrawingRunTime.displayMode == "Portrait"){
                aCP.x += 50 * animationFactor2;
                aCP.y -= 50 * animationFactor2;
                aCP.width -= 100 * animationFactor2;
                aCP.height -= 100 * animationFactor2;
            }else{
                aCP.x -= 50 * animationFactor2;
                aCP.y += 50 * animationFactor2;
                aCP.width -= 100 * animationFactor2;
                aCP.height -= 100 * animationFactor2;
            }

            aCP.x += DrawingRunTime.produceMinuteShakes(0);
            aCP.y += DrawingRunTime.produceMinuteShakes(1);
            
        }
        {
            let spotifyState = BackgroundTasks.currentSpotifyState;

            if (spotifyState){
                DrawingRunTime.renderObjects.SongTitle.text = spotifyState.trackName;
            }

            let timeFactor = Math.min(1, (Date.now() - TimingState.timeSinceDisplayModeChange) / 1000);
            let animationFactor = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor));
            let animationFactor_2 = AnimationTween.bounce(AnimationTween.jadeTween(AnimationTween.exponential(timeFactor)));
            
            let aCP = DrawingRunTime.renderObjects.AlbumCover;
            let sTP = DrawingRunTime.renderObjects.SongTitle;
            
            context2D.font = "bold 50px Sauce Code Pro"
            let titleWidth = context2D.measureText(DrawingRunTime.renderObjects.SongTitle.text).width;

            let landscapePosition = {
                x: aCP.x + aCP.width + 50,
                y: aCP.y + aCP.height / 2 - 150,
                maxWidth: (maxWidth - sTP.x) - 50,
            }

            let portraitPosition = {
                x: Math.max(maxWidth * 0.1 / 2, aCP.x + aCP.width / 2 - titleWidth / 2),
                y: aCP.y + aCP.height + 5,
                maxWidth: maxWidth * 0.9
            }

            sTP.x = portraitPosition.x + (landscapePosition.x - portraitPosition.x) * (DrawingRunTime.displayMode == "Portrait" ?  1 - animationFactor : animationFactor) + 250 * animationFactor_2;
            sTP.y = portraitPosition.y + (landscapePosition.y - portraitPosition.y) * (DrawingRunTime.displayMode == "Portrait" ?  1 - animationFactor : animationFactor);
            sTP.maxWidth = Math.max(1, portraitPosition.maxWidth + (landscapePosition.maxWidth - portraitPosition.maxWidth) * (DrawingRunTime.displayMode == "Portrait" ?  1 - animationFactor : animationFactor));
            sTP.textWidth = titleWidth + 50;

            if (titleWidth >= sTP.maxWidth){
                sTP.scrollDurationMaximum = sTP.textWidth * 12;

                let scrollFactor = (Math.min(1, (Date.now() - sTP.timeSinceScroll )/ sTP.scrollDurationMaximum) % 1);
                let animationFactor2 = AnimationTween.cos(scrollFactor);
                sTP.scrollPosition = sTP.textWidth * animationFactor2;
                if (Date.now() - sTP.timeSinceScroll > sTP.scrollDurationMaximum + 1000){
                    sTP.timeSinceScroll = Date.now();
                }
            }else{
                sTP.scrollPosition = 0;
            }
        }
        {

            let spotifyState = BackgroundTasks.currentSpotifyState;

            if (spotifyState){
                DrawingRunTime.renderObjects.SongArtist.text = spotifyState.artistName;
            }

            let timeFactor = Math.min(1, (Date.now() - TimingState.timeSinceDisplayModeChange) / 1000);
            let animationFactor = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor));
            let animationFactor_2 = AnimationTween.bounce(AnimationTween.jadeTween(AnimationTween.exponential(timeFactor)));
            
            let aCP = DrawingRunTime.renderObjects.AlbumCover;
            let sTP = DrawingRunTime.renderObjects.SongArtist;
            
            context2D.font = "bold 35px Sauce Code Pro"
            let titleWidth = context2D.measureText(DrawingRunTime.renderObjects.SongArtist.text).width;

            let landscapePosition = {
                x: aCP.x + aCP.width + 50,
                y: aCP.y + aCP.height / 2 - 70,
                maxWidth: (maxWidth - sTP.x) - 50,
            }

            let portraitPosition = {
                x: Math.max(maxWidth * 0.1 / 2, aCP.x + aCP.width / 2 - titleWidth / 2),
                y: aCP.y + aCP.height + 55,
                maxWidth: maxWidth * 0.9
            }

            sTP.x = portraitPosition.x + (landscapePosition.x - portraitPosition.x) * (DrawingRunTime.displayMode == "Portrait" ?  1 - animationFactor : animationFactor) + 250 * animationFactor_2;
            sTP.y = portraitPosition.y + (landscapePosition.y - portraitPosition.y) * (DrawingRunTime.displayMode == "Portrait" ?  1 - animationFactor : animationFactor);
            sTP.maxWidth = Math.max(1, portraitPosition.maxWidth + (landscapePosition.maxWidth - portraitPosition.maxWidth) * (DrawingRunTime.displayMode == "Portrait" ?  1 - animationFactor : animationFactor));
            sTP.textWidth = titleWidth + 50;

            if (titleWidth >= sTP.maxWidth){
                sTP.scrollDurationMaximum = sTP.textWidth * 12;

                let scrollFactor = (Math.min(1, (Date.now() - sTP.timeSinceScroll )/ sTP.scrollDurationMaximum) % 1);
                let animationFactor2 = AnimationTween.cos(scrollFactor);
                sTP.scrollPosition = sTP.textWidth * animationFactor2;
                if (Date.now() - sTP.timeSinceScroll > sTP.scrollDurationMaximum + 1000){
                    sTP.timeSinceScroll = Date.now();
                }
            }else{
                sTP.scrollPosition = 0;
            }
        }
        {

            let timeFactor = Math.min(1, (Date.now() - TimingState.timeSinceDisplayModeChange) / 1000);
            let animationFactor = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor));

            let aCP = DrawingRunTime.renderObjects.AlbumCover;
            let sCP = DrawingRunTime.renderObjects.SongContent;
            let dCP = DrawingRunTime.renderObjects.DFTContent;


            // if (DrawingRunTime.displayMode == "Landscape"){
            //     animationFactor = 1 - animationFactor;
            // }

            sCP.width = maxWidth * 0.8;
            sCP.y = dCP.y + dCP.height + 15;
            sCP.x = maxWidth * 0.1;
        }
        {

            let timeFactor = Math.min(1, (Date.now() - TimingState.timeSinceDisplayModeChange) / 1000);
            let animationFactor = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor));

            let aCP = DrawingRunTime.renderObjects.AlbumCover;
            let dCP = DrawingRunTime.renderObjects.DFTContent;
            

            let timeSinceJadeLyricsLoaded = TimingState.timeSinceJadeLyricsLoaded;
            let loadedJadeLyrics = BackgroundTasks.jadeLyricsSupported;

            let timeFactor2= Math.min(1, (Date.now() - TimingState.timeSinceJadeLyricsLoaded) / 1000);
            let animationFactor2 = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor2));

            if (loadedJadeLyrics){
                animationFactor2 = 1 - animationFactor2;
            }

            if (DrawingRunTime.displayMode == "Landscape"){
                animationFactor = 1 - animationFactor;
            }

            let spotifyState = BackgroundTasks.currentSpotifyState;

            let enabled = false;

            if (spotifyState){
                if (spotifyState.playState){
                    if (dCP.currentAudioSample[0] + dCP.currentAudioSample[25] > 0){
                        dCP.timeSinceAudio = Date.now();
                    }
                    if (Date.now() - dCP.timeSinceAudio > 1000){
                        enabled = false;
                    }else
                        enabled = true;
                }else{
                    enabled = false;
                }
            }

            if (dCP.enabled != enabled){
                dCP.enabled = enabled;
                dCP.timeSinceEnabled = Date.now();
            }

            let landscapePosition = {
                x: 15 + aCP.x + aCP.width,
                y: aCP.height + aCP.y - dCP.height,
                width: Math.min(1000, maxWidth * 0.9 - dCP.x),
                height: 175,
            }
            
            let portraitPosition = {
                x: maxWidth * 0.1,
                y: aCP.y + aCP.height + 15 + 125,
                width: maxWidth * 0.8,
                height: 125 + 50 * animationFactor2,
            }
            
            dCP.y = landscapePosition.y + (portraitPosition.y - landscapePosition.y) * animationFactor;
            dCP.x = landscapePosition.x + (portraitPosition.x - landscapePosition.x) * animationFactor;
            dCP.width = landscapePosition.width + (portraitPosition.width - landscapePosition.width) * animationFactor;
            dCP.height = landscapePosition.height + (portraitPosition.height - landscapePosition.height) * animationFactor;
        }
        {

            let spotifyState = BackgroundTasks.currentSpotifyState;

            if (spotifyState){
                DrawingRunTime.renderObjects.SongAlbum.text = spotifyState.albumName;
            }

            let timeFactor = Math.min(1, (Date.now() - TimingState.timeSinceDisplayModeChange) / 1000);
            let animationFactor = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor));
            let animationFactor_2 = AnimationTween.bounce(AnimationTween.jadeTween(AnimationTween.exponential(timeFactor)));
            
            let aCP = DrawingRunTime.renderObjects.AlbumCover;
            let sTP = DrawingRunTime.renderObjects.SongAlbum;
            
            context2D.font = "bold 35px Sauce Code Pro"
            let titleWidth = context2D.measureText(DrawingRunTime.renderObjects.SongAlbum.text).width;

            let landscapePosition = {
                x: aCP.x + aCP.width + 50,
                y: aCP.y + aCP.height / 2 - 100,
                maxWidth: (maxWidth - sTP.x) - 50,
            }

            let portraitPosition = {
                x: Math.max(maxWidth * 0.1 / 2, aCP.x + aCP.width / 2 - titleWidth / 2),
                y: aCP.y + aCP.height + 90,
                maxWidth: maxWidth * 0.9
            }

            sTP.x = portraitPosition.x + (landscapePosition.x - portraitPosition.x) * (DrawingRunTime.displayMode == "Portrait" ?  1 - animationFactor : animationFactor) + 250 * animationFactor_2;
            sTP.y = portraitPosition.y + (landscapePosition.y - portraitPosition.y) * (DrawingRunTime.displayMode == "Portrait" ?  1 - animationFactor : animationFactor);
            sTP.maxWidth = Math.max(1, portraitPosition.maxWidth + (landscapePosition.maxWidth - portraitPosition.maxWidth) * (DrawingRunTime.displayMode == "Portrait" ?  1 - animationFactor : animationFactor));
            sTP.textWidth = titleWidth + 50;

            if (titleWidth >= sTP.maxWidth){
                sTP.scrollDurationMaximum = sTP.textWidth * 12;

                let scrollFactor = (Math.min(1, (Date.now() - sTP.timeSinceScroll )/ sTP.scrollDurationMaximum) % 1);
                let animationFactor2 = AnimationTween.cos(scrollFactor);
                sTP.scrollPosition = sTP.textWidth * animationFactor2;
                if (Date.now() - sTP.timeSinceScroll > sTP.scrollDurationMaximum + 1000){
                    sTP.timeSinceScroll = Date.now();
                }
            }else{
                sTP.scrollPosition = 0;
            }
        }
        {

            let timeFactor = Math.min(1, (Date.now() - TimingState.timeSinceDisplayModeChange) / 1000);
            let animationFactor = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor));

            let sCP = DrawingRunTime.renderObjects.SongContent;
            let cBP = DrawingRunTime.renderObjects.ControlBar;
            let tPDE = cBP.timePositionDragElement;
            
            if (DrawingRunTime.displayMode == "Landscape"){
                animationFactor = 1 - animationFactor;
            }
            // let timeLength = currentSpotfiyState.timeLength;
            // let currentTime = (currentTimePositionFactor * timeLength);
            // let timeString = `${Formatters.toTime(currentTime)} / ${Formatters.toTime(timeLength)}`;


            context2D.font = "bold 15px Sauce Code Pro";

            let landscapeY = sCP.y + sCP.height + 50;
            let portraitY = maxHeight - 100;

            cBP.width = maxWidth * 0.8;
            cBP.x = maxWidth * 0.1;
            cBP.y = landscapeY + (portraitY - landscapeY) * (1 - (1 - animationFactor) * (1 - tPDE.animationFactor));
            cBP.height = 29;
        }
        {

        }
        {
            context2D.font = "bold 20px Sauce Code Pro";
            let cBP = DrawingRunTime.renderObjects.ControlBar;
            let currentSpotifyState = BackgroundTasks.currentSpotifyState;

            let progressBar = 0;
            let transitionTimeFactor = 0;

            let timeString = "N/A";
            let previousTimeString = "N/A";

            if (currentSpotifyState){
                let currentTimePosition = currentSpotifyState.timePosition + (Date.now() - currentSpotifyState.timeFeteched) / 1000;

                if (currentSpotifyState.playState == false){
                    currentTimePosition = currentSpotifyState.timePosition;
                }

                let tPDE = cBP.timePositionDragElement;

                if (tPDE.active != tPDE.raw.active){
                    tPDE.active = tPDE.raw.active;
                    tPDE.timeSinceActive = Date.now();
                }

                tPDE.currentTimePositionFactor = Math.max(0, Math.min(1, (tPDE.raw.x - cBP.x) / (cBP.width)));

                let timeFactor = Math.max(0, Math.min(1, (Date.now() - tPDE.timeSinceActive) / 1000));
                let animationFactor = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor));


                if (tPDE.active == false)
                    animationFactor = 1 - animationFactor;

                tPDE.animationFactor = animationFactor;

                tPDE.currentTimePosition = currentTimePosition = Math.max(0, currentTimePosition + (currentSpotifyState.timeLength * tPDE.currentTimePositionFactor - currentTimePosition) * animationFactor);
                
                
                let flooredTimePosition = Math.floor(currentTimePosition);
                if (cBP.currentFlooredTime != flooredTimePosition){
                    cBP.currentFlooredTime = flooredTimePosition;
                    cBP.previousExtraString = cBP.currentExtraString;
                    cBP.currentExtraString = cBP.extraString;
                }
                transitionTimeFactor = currentTimePosition % 1;
                let transitionAnimationFactor = AnimationTween.jadeTween(AnimationTween.exponential(transitionTimeFactor));

                progressBar = (flooredTimePosition + transitionAnimationFactor) / currentSpotifyState.timeLength;

                if (tPDE.active == false){
                    timeString = cBP.currentExtraString + Formatters.toTime(currentTimePosition);
                    previousTimeString = cBP.previousExtraString + Formatters.toTime(Math.max(0, currentTimePosition - 1));
                }else{
                    timeString = Formatters.toTime(currentTimePosition);
                    previousTimeString = Formatters.toTime(Math.max(0, currentTimePosition - 1));
                }


                cBP.timeLengthString = Formatters.toTime(Math.max(currentSpotifyState.timeLength));
                cBP.timeLengthStringWidth = context2D.measureText(cBP.timeLengthString).width + 15;
            }


            let timeStringWidth = context2D.measureText(timeString).width;
            
            let timePatternBoxWidth = context2D.measureText(timeString).width + 15;
            let previousTimePatternBoxWidth = context2D.measureText(previousTimeString).width + 15;

            let transitionAnimationFactor = AnimationTween.jadeTween(AnimationTween.exponential(transitionTimeFactor));

            timePatternBoxWidth = previousTimePatternBoxWidth + (timePatternBoxWidth - previousTimePatternBoxWidth) * transitionAnimationFactor;

            cBP.timePatternBoxWidth = timePatternBoxWidth;
            cBP.timeStringWidth = timeStringWidth;
            cBP.timeString = timeString;
            cBP.progressBar = progressBar;
            cBP.subSecondProgressBar = transitionTimeFactor;
            cBP.previousTimeString = previousTimeString;
        }
        {
            let timeFactor = Math.min(Math.max((Date.now() - DrawingRunTime.timeSinceTrackSwitchAction) / 1500, 0), 1);   
            let animationFactor = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor));

            let direction = DrawingRunTime.trackSwitchAction == "left" ? 1 : -1;

            let segmentedAnimationFactor_1 = Math.min(animationFactor, .5) * 2;
            let segmentedAnimationFactor_2 = Math.max(animationFactor - 0.5, 0) * 2;

            let aCP = DrawingRunTime.renderObjects.AlbumCover;
            let renderProfile = aCP.renderProfile;

            

            if (segmentedAnimationFactor_2 > 0){
                if (timeFactor < 1){
                    renderProfile.xScale = segmentedAnimationFactor_2;
                    renderProfile.rotation = direction * Math.PI / 4 * (1 - segmentedAnimationFactor_2);
                    renderProfile.xOffset = direction * 200 * (1 - segmentedAnimationFactor_2);
                    renderProfile.yOffset = 200 * (1 - segmentedAnimationFactor_2);
                    renderProfile.yScale = segmentedAnimationFactor_2;
                    renderProfile.imageRenderStyle = "current";
                }else{
                    renderProfile.imageRenderStyle = "old";
                    renderProfile.xScale = 1;
                    renderProfile.yScale = 1;
                    renderProfile.xOffset = 0;
                    renderProfile.yOffset = 0;
                }
            }else{
                renderProfile.xScale = 1 - segmentedAnimationFactor_1;
                renderProfile.rotation = - direction * Math.PI / 4 * segmentedAnimationFactor_1;
                renderProfile.xOffset = - direction * 200 * segmentedAnimationFactor_1;
                renderProfile.yOffset = 200 * segmentedAnimationFactor_1;
                renderProfile.yScale = 1 - segmentedAnimationFactor_1;
                renderProfile.imageRenderStyle = "previous";
            }

            let timeFactor2 = Math.min(Math.max((Date.now() - DrawingRunTime.timeSinceCurrentAction) / 1000, 0), 1);
            let animationFactor2 = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor2));

            let timeFactor3 = Math.min(Math.max((Date.now() - DrawingRunTime.timeSinceCurrentAction - 2000) / 1000, 0), 1);
            let animationFactor3 = 1 - AnimationTween.jadeTween(AnimationTween.exponential(timeFactor3));

            let animationFactor4 = animationFactor2 * animationFactor3;

            renderProfile.xScale *= (1 - animationFactor4) * 0.1 + 0.9;
            renderProfile.yScale *= (1 - animationFactor4) * 0.1 + 0.9;
            renderProfile.xOffset -= 5 * animationFactor4;
            renderProfile.yOffset -= 5 * animationFactor4;
        }

        DrawingRunTime.averageCalculationTime = (DrawingRunTime.averageCalculationTime + Date.now() - startCalculationTime) / 2; 

        //RENDER
        let startRenderingTime = Date.now();

        // context2D.clearRect(0, 0, maxWidth, maxHeight);
        context2D.drawImage(DrawingRunTime.backgroundCanvas, 0, 0, maxWidth, maxHeight);


        context2D.textAlign = "left";
        context2D.shadowBlur = 0;
        context2D.shadowColor = Color.immediate(0, 0, 0, 0);
        // context2D.shadowBlur = 10;
        // context2D.shadowColor = ColorMixer.newOpacity(ColorMixer.brighten(backgroundColor), .25).toStyle();
        // context2D.shadowOffsetX = 4;
        // context2D.shadowOffsetY = 4;
        // context2D.shadowColor = Color.immediate(0, 0, 0, .2);
        // context2D.shadowColor = Color.immediate(0, 0, 0, 0);
        // context2D.shadowOffsetX = 0;
        // context2D.shadowOffsetY = 0;
        {

            let sTP = DrawingRunTime.renderObjects.SongTitle;
            let sAbP = DrawingRunTime.renderObjects.SongAlbum;
            let sAP = DrawingRunTime.renderObjects.SongArtist;
            context2D.save();
            context2D.rect(Math.min(sAbP.x, sAP.x, sTP.x) - 25, sTP.y, Math.max(sAbP.maxWidth, sAP.maxWidth, sTP.maxWidth)  + 50, 1000);
            context2D.clip();
        }
        {
            let sTP = DrawingRunTime.renderObjects.SongTitle;
    
            let actualWidth = 50 + sTP.maxWidth;
            let gradient = context2D.createLinearGradient(sTP.x - 25, 0, sTP.x + 25 + sTP.maxWidth, 0);
    
            gradient.addColorStop(0, ColorMixer.newOpacity(textColor, 0).toStyle());
            gradient.addColorStop(25 / actualWidth, ColorMixer.newOpacity(textColor, 1).toStyle());
            gradient.addColorStop(1 - 25 / actualWidth, ColorMixer.newOpacity(textColor, 1).toStyle());
            gradient.addColorStop(1, ColorMixer.newOpacity(textColor, 0).toStyle());
    
            context2D.fillStyle = gradient;
            context2D.font = "bold 50px Sauce Code Pro"
            context2D.textBaseline = "top";
            context2D.fillText(sTP.text, sTP.x - sTP.scrollPosition, sTP.y);
            
            if (sTP.scrollPosition != 0){
                context2D.fillText(sTP.text, sTP.x - sTP.scrollPosition + sTP.textWidth, sTP.y);
            }
        }
        {
            let sAP = DrawingRunTime.renderObjects.SongAlbum;
    
            let actualWidth = 50 + sAP.maxWidth;
            let gradient = context2D.createLinearGradient(sAP.x - 25, 0, sAP.x + 25 + sAP.maxWidth, 0);
    
            gradient.addColorStop(0, ColorMixer.newOpacity(textColor, 0).toStyle());
            gradient.addColorStop(25 / actualWidth, ColorMixer.newOpacity(textColor, 1).toStyle());
            gradient.addColorStop(1 - 25 / actualWidth, ColorMixer.newOpacity(textColor, 1).toStyle());
            gradient.addColorStop(1, ColorMixer.newOpacity(textColor, 0).toStyle());
    
            context2D.fillStyle = gradient;
            context2D.font = "bold 35px Sauce Code Pro"
            context2D.textBaseline = "top";
            context2D.fillText(sAP.text, sAP.x - sAP.scrollPosition, sAP.y);
            
            if (sAP.scrollPosition != 0){
                context2D.fillText(sAP.text, sAP.x - sAP.scrollPosition + sAP.textWidth, sAP.y);
            }
        }
        {
            let sAP = DrawingRunTime.renderObjects.SongArtist;
    
            let actualWidth = 50 + sAP.maxWidth;
            let gradient = context2D.createLinearGradient(sAP.x - 25, 0, sAP.x + 25 + sAP.maxWidth, 0);
    
            gradient.addColorStop(0, ColorMixer.newOpacity(textColor, 0).toStyle());
            gradient.addColorStop(25 / actualWidth, ColorMixer.newOpacity(textColor, 1).toStyle());
            gradient.addColorStop(1 - 25 / actualWidth, ColorMixer.newOpacity(textColor, 1).toStyle());
            gradient.addColorStop(1, ColorMixer.newOpacity(textColor, 0).toStyle());
    
            context2D.fillStyle = gradient;
            context2D.font = "bold 35px Sauce Code Pro"
            context2D.textBaseline = "top";
            context2D.fillText(sAP.text, sAP.x - sAP.scrollPosition, sAP.y);
            
            if (sAP.scrollPosition != 0){
                context2D.fillText(sAP.text, sAP.x - sAP.scrollPosition + sAP.textWidth, sAP.y);
            }
        }

        context2D.restore();

        let aCP = DrawingRunTime.renderObjects.AlbumCover;
        let renderProfile = aCP.renderProfile;

        context2D.save();
        
        context2D.translate(aCP.x + aCP.width / 2 + renderProfile.xOffset, aCP.y + aCP.height / 2 + renderProfile.yOffset);
        context2D.rotate(renderProfile.rotation);
        context2D.scale(renderProfile.xScale, renderProfile.yScale);

        let pivotX = - aCP.width / 2;
        let pivotY = - aCP.height / 2;


        context2D.beginPath();
        context2D.roundRect(pivotX, pivotY, aCP.width, aCP.height, 25);

        context2D.fillStyle = ColorMixer.brighten(ColorMixer.newOpacity(backgroundColor, .75)).toStyle();
        
        if (DynamicPrimaryColorEngine.measureBrightness(backgroundColor) < 0.05){
            context2D.shadowBlur = 250;
            context2D.shadowOffsetX = 0;
            context2D.shadowOffsetY = 0;
            context2D.shadowColor = ColorMixer.newOpacity(foregroundColor, .25).toStyle();
            context2D.fill();
        }else{
            context2D.shadowBlur = 15;
            context2D.shadowOffsetX = -4;
            context2D.shadowOffsetY = -4;
            context2D.shadowColor = ColorMixer.newOpacity(ColorMixer.brighten(backgroundColor), 1).toStyle();
            context2D.fill();
            
            context2D.shadowBlur = 10;
            context2D.shadowOffsetX = 4;
            context2D.shadowOffsetY = 4;
            context2D.shadowColor = ColorMixer.newOpacity(ColorMixer.darken(backgroundColor), 1).toStyle();
            context2D.fill();
        }
    
        context2D.clip();

        if (aCP.image){
            switch(renderProfile.imageRenderStyle){
                case "old":{
                    if (aCP.imageTransitionFactor < 1 && aCP.previousImage){
                        ImageDrawer.drawImage(context2D, aCP.image, pivotX, pivotY, aCP.width, aCP.height);
        
                        context2D.globalAlpha = 1 - aCP.imageTransitionFactor;
                        ImageDrawer.drawImage(context2D, aCP.previousImage, pivotX, pivotY, aCP.width, aCP.height);
                        context2D.globalAlpha = 1;
                    }else{
                        ImageDrawer.drawImage(context2D, aCP.image!, pivotX, pivotY, aCP.width, aCP.height);
                    }
                    break;
                }
                case "current":{
                    ImageDrawer.drawImage(context2D, aCP.image, pivotX, pivotY, aCP.width, aCP.height);
                    break;
                }
                case "previous":{
                    if (aCP.previousImage)
                        ImageDrawer.drawImage(context2D, aCP.previousImage, pivotX, pivotY, aCP.width, aCP.height);
                    break;
                }
            }

        }

        context2D.restore();
        {

            let aCP = DrawingRunTime.renderObjects.AlbumCover;
            // DrawingRunTime.timeSinceCurrentAction = Date.now() - 500;
            let timeFactor = Math.min(1, Math.max(0, (Date.now() - DrawingRunTime.timeSinceCurrentAction) / 1000));
            let animationFactor = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor));
            
            let timeFactor2 = Math.min(1, Math.max(0, (Date.now() - DrawingRunTime.timeSinceCurrentAction - 2000) / 1000));
            let animationFactor2 = 1 - AnimationTween.jadeTween(AnimationTween.exponential(timeFactor2));

            let animationFactor3 = animationFactor * animationFactor2;



            context2D.beginPath();


            context2D.save();
            context2D.translate(aCP.x + aCP.width * (.8 + 0.2 * (1 - animationFactor3)), aCP.y + aCP.height * (.8 + 0.2 * (1 - animationFactor3)));
            context2D.scale(0.8 * animationFactor3, 0.8 * animationFactor3);
            context2D.roundRect(-100, -100, 200, 200, 25);
            context2D.scale(0.8, 0.8);
            context2D.closePath();

            context2D.fillStyle = ColorMixer.newOpacity(backgroundColor, 0.2).toStyle();
            context2D.shadowBlur = 15;
            context2D.shadowOffsetX = -4;
            context2D.shadowOffsetY = -4;
            context2D.shadowColor = ColorMixer.newOpacity(ColorMixer.brighten(backgroundColor), 1).toStyle();
            context2D.fill();
            context2D.shadowBlur = 15;
            context2D.shadowOffsetX = 4;
            context2D.shadowOffsetY = 4;
            context2D.shadowColor = ColorMixer.newOpacity(ColorMixer.darken(backgroundColor), 1).toStyle();
            context2D.fill();

            context2D.clip();

            context2D.fillStyle = foregroundColor.toStyle();
            context2D.strokeStyle = foregroundColor.toStyle();
            context2D.shadowBlur = 0;
            context2D.shadowOffsetX = 0;
            context2D.shadowOffsetY = 0;
            context2D.shadowColor = Color.immediate(0, 0, 0, 0);
            
            switch(DrawingRunTime.currentAction){
                default:  
                case "Skip Track":
                case "Previous Track":{
                    context2D.scale(0.75, 0.75);
                    let timeFactor = Math.min(1, Math.max(0, (Date.now() - DrawingRunTime.timeSinceCurrentAction - 400) / 1000));
                    let animationFactor = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor));

                    if (DrawingRunTime.currentAction == "Previous Track")
                        context2D.scale(-1, 1);
                    context2D.lineJoin = "round";
                    context2D.lineWidth = 15;
                    context2D.beginPath();
                    context2D.moveTo(-7 + 132 * animationFactor, 0);
                    context2D.lineTo(-132 + 132 * animationFactor, -75);
                    context2D.lineTo(-132 + 132 * animationFactor, 75);
                    context2D.closePath();
                    context2D.stroke();
                    context2D.fill();
                    
                    context2D.scale(Math.max(0.1, 1 - animationFactor), Math.max(0.1, 1 - animationFactor));
                    context2D.beginPath();
                    context2D.moveTo(132 + 132 * animationFactor, 0);
                    context2D.lineTo(7 + 132 * animationFactor, -75);
                    context2D.lineTo(7 + 132 * animationFactor, 75);
                    context2D.closePath();
                    context2D.stroke();
                    context2D.fill();
                    context2D.scale(1 / Math.max(0.1, 1 - animationFactor), 1 / Math.max(0.1, 1 - animationFactor));

                    context2D.scale(Math.max(0.1, animationFactor), Math.max(0.1, animationFactor));
                    context2D.beginPath();
                    context2D.moveTo(-132 + 132 * animationFactor, 0);
                    context2D.lineTo(-257 + 132 * animationFactor, -75);
                    context2D.lineTo(-257 + 132 * animationFactor, 75);
                    context2D.closePath();
                    context2D.stroke();
                    context2D.fill();
                    context2D.scale(1 / Math.max(0.1, animationFactor), 1 / Math.max(0.1, animationFactor));

                    if (DrawingRunTime.currentAction == "Previous Track")
                        context2D.scale(-1, 1);

                    context2D.scale(1.25, 1.25);
                    break;
                }
                case "Play":
                case "Pause":{
                    context2D.scale(0.8, 0.8);
                    let animationKey = {
                        "Play": [
                            [-75, -75],
                            [-20, -75],
                            [-20, 75],
                            [-75, 75],
                            [20, -75],
                            [75, -75],
                            [75, 75],
                            [20, 75],
                        ],
                        "Pause": [
                            [-100, -100],
                            [0, -50],
                            [0, 50],
                            [-100, 100],
                            [0, -50],
                            [100, 0],
                            [100, 0],
                            [0, 50],
                        ]
                    }
                    let newAnimationKey: ([number, number])[] = [];

                    let timeFactor = Math.min(1, Math.max(0, (Date.now() - DrawingRunTime.timeSinceCurrentAction - 400) / 1000));
                    let animationFactor = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor));

                    let fromAnimationKey = animationKey.Play;
                    let toAnimationKey = animationKey.Pause;
                    if (DrawingRunTime.currentAction == "Pause"){
                        fromAnimationKey = animationKey.Pause;
                        toAnimationKey = animationKey.Play;
                    }

                    for (let i = 0;i<8;i++){
                        newAnimationKey[i] = [
                            fromAnimationKey[i][0] + (toAnimationKey[i][0] - fromAnimationKey[i][0]) * animationFactor, 
                            fromAnimationKey[i][1] + (toAnimationKey[i][1] - fromAnimationKey[i][1]) * animationFactor
                        ]; 
                    }


                    context2D.lineJoin = "round";
                    context2D.lineWidth = 15;

                    context2D.beginPath();
                    context2D.moveTo(newAnimationKey[0][0], newAnimationKey[0][1]);
                    context2D.lineTo(newAnimationKey[1][0], newAnimationKey[1][1]);
                    context2D.lineTo(newAnimationKey[2][0], newAnimationKey[2][1]);
                    context2D.lineTo(newAnimationKey[3][0], newAnimationKey[3][1]);
                    context2D.closePath();
                    context2D.fill();
                    context2D.stroke();

                    context2D.beginPath();
                    context2D.lineTo(newAnimationKey[4][0], newAnimationKey[4][1]);
                    context2D.lineTo(newAnimationKey[5][0], newAnimationKey[5][1]);
                    context2D.lineTo(newAnimationKey[6][0], newAnimationKey[6][1]);
                    context2D.lineTo(newAnimationKey[7][0], newAnimationKey[7][1]);
                    context2D.closePath();
                    context2D.fill();
                    context2D.stroke();
                    context2D.scale(1.2, 1.2);

                    break;
                }
            }

            context2D.font = "900 45px Sauce Code Pro";
            context2D.textAlign = "center";
            context2D.textBaseline = "middle";
            // context2D.fillText(DrawingRunTime.currentAction.toUpperCase(), 0, 0 + 125);

            context2D.restore();
            
        }

        {

                
            let cBP = DrawingRunTime.renderObjects.ControlBar;

            context2D.beginPath();
            context2D.roundRect(cBP.x, cBP.y, cBP.width, cBP.height, 25);
            context2D.closePath();

            context2D.fillStyle = foregroundColor.toStyle();
            context2D.fill();

            let timeLength = BackgroundTasks.currentSpotifyState?.timeLength || 100;
            context2D.fillStyle = backgroundColor.toStyle();

            let timeFactor7 = Math.min(1, (Date.now() - TimingState.timeSinceJadeLyricsLoaded) / 1000);
            let animationFactor7 = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor7));

            if (BackgroundTasks.jadeLyricsSupported == false)
                animationFactor7 = 1 - animationFactor7;

            for (let lineProgression of BackgroundTasks.renderedJadeLyricsBar){
                let x = (cBP.width - 10) * lineProgression.start / timeLength;
                let width = (cBP.width - 10) * (lineProgression.end - lineProgression.start) / timeLength;
                let height = (cBP.height - 10 - 10) * animationFactor7;
                context2D.beginPath();
                context2D.roundRect(cBP.x + 5 + x, cBP.y + (cBP.height - height) / 2, width, height, 25);
                context2D.closePath();
                
                context2D.fill();
            }

            context2D.beginPath();
            context2D.roundRect(cBP.x + 5, cBP.y + 5, (cBP.width - 10) * cBP.progressBar, cBP.height - 10, 25);
            context2D.closePath();

            context2D.fillStyle = backgroundColor.toStyle();
            context2D.fill();
            context2D.fillStyle = foregroundColor.toStyle();

            context2D.save();
            context2D.clip();
            
            for (let lineProgression of BackgroundTasks.renderedJadeLyricsBar){
                let x = (cBP.width - 10) * lineProgression.start / timeLength;
                let width = (cBP.width - 10) * (lineProgression.end - lineProgression.start) / timeLength;
                let height = (cBP.height - 10 - 10) * animationFactor7;
                context2D.beginPath();
                context2D.roundRect(cBP.x + 5 + x, cBP.y + (cBP.height - height) / 2, width, height, 25);
                context2D.closePath();
                
                context2D.fill();
            }
            context2D.restore();


            
            let actualX = (cBP.width - 10) * cBP.progressBar;
            actualX = Math.min(cBP.width - (cBP.timeLengthStringWidth + cBP.timePatternBoxWidth / 2), Math.max(100 + cBP.timePatternBoxWidth / 2, actualX));
            actualX += cBP.x - cBP.timePatternBoxWidth / 2;

            {
                context2D.fillStyle = foregroundColor.toStyle();

                let timeFactor = Math.min(1, (Date.now() - cBP.timeSinceLeftBoxShake) / 1000);

                if (cBP.timeSinceLeftBoxShake == -1)
                    timeFactor = 1;

                let barX = cBP.x + Math.sin((Date.now() - cBP.timeSinceLeftBoxShake) / 50) * 25 * (1 - timeFactor);

                context2D.beginPath();
                context2D.roundRect(barX, cBP.y - 35, 100, cBP.height, 25);
                context2D.closePath();

                
                context2D.fill();
                context2D.beginPath();

                let leftBounds = cBP.x + 100 - 12;
                let topBounds = cBP.y - 35;
                let bottomBounds = cBP.y - 35 + cBP.height;
                let rightBounds = actualX + 12;
                let stretchedFactor = Math.min(1, (Math.abs(leftBounds - rightBounds) - 24) / 50);

                let tPDE = cBP.timePositionDragElement;
                if (stretchedFactor < 1 && tPDE.animationFactor == 0){
                    cBP.timeSinceLeftBoxShake = -1;
                    context2D.moveTo(leftBounds, topBounds);
                    context2D.bezierCurveTo(leftBounds + 25, topBounds + 18 * stretchedFactor, rightBounds - 25, topBounds + 18 * stretchedFactor, rightBounds, topBounds);
                    context2D.lineTo(rightBounds, bottomBounds);
                    context2D.bezierCurveTo(rightBounds - 25, bottomBounds - 18 * stretchedFactor, leftBounds + 25, bottomBounds - 18 * stretchedFactor, leftBounds, bottomBounds);
                    context2D.lineTo(leftBounds, topBounds);
                    context2D.closePath();
    
                    context2D.fill();
                }else{
                    if (cBP.timeSinceLeftBoxShake == -1){
                        cBP.timeSinceLeftBoxShake = Date.now();
                    }
                }
                
                {
                    context2D.font = "bold 20px Sauce Code Pro";
                    context2D.save();
                    context2D.beginPath();
                    context2D.translate(barX + 100 / 2, cBP.y - 35 + cBP.height / 2);

                    let timeFactor = Math.min(1, (Date.now() - cBP.timeSinceStateChange) / 1000);
                    let animationFactor = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor));

                    if (cBP.playing){
                        animationFactor = 1 - animationFactor;
                    }

                    // context2D.lineJoin = "round";
                    // context2D.lineWidth = 3;

                    {
                        let leftSegment = {
                            playing: [
                                [-8, -10],
                                [-3, -10],
                                [-3, 10],
                                [-8, 10],
                            ],
                            paused: [
                                [-10, -10],
                                [0, -5],
                                [0, 5],
                                [-10, 10],
                            ]
                        }
                        let playingCoordinate = leftSegment.playing[0];
                        let pausedCoordinate = leftSegment.paused[0];

                        context2D.moveTo(
                            playingCoordinate[0] + (pausedCoordinate[0] - playingCoordinate[0]) * animationFactor,
                            playingCoordinate[1] + (pausedCoordinate[1] - playingCoordinate[1]) * animationFactor,
                        );

                        for (let i = 1;i<4;i++){
                            let playingCoordinate = leftSegment.playing[i];
                            let pausedCoordinate = leftSegment.paused[i];

                            context2D.lineTo(
                                playingCoordinate[0] + (pausedCoordinate[0] - playingCoordinate[0]) * animationFactor,
                                playingCoordinate[1] + (pausedCoordinate[1] - playingCoordinate[1]) * animationFactor,
                            );
                        }

                        context2D.closePath();

                        context2D.fillStyle = backgroundColor.toStyle();
                        context2D.strokeStyle = backgroundColor.toStyle();
                        context2D.fill();
                        context2D.stroke();
                    }
                    {
                        let rightSegment = {
                            playing: [
                                [8, -10],
                                [3, -10],
                                [3, 10],
                                [8, 10],
                            ],
                            paused: [
                                [10, 0],
                                [0, -5],
                                [0, 5],
                                [10, 0],
                            ]
                        }
                        let playingCoordinate = rightSegment.playing[0];
                        let pausedCoordinate = rightSegment.paused[0];

                        context2D.moveTo(
                            playingCoordinate[0] + (pausedCoordinate[0] - playingCoordinate[0]) * animationFactor,
                            playingCoordinate[1] + (pausedCoordinate[1] - playingCoordinate[1]) * animationFactor,
                        );

                        for (let i = 1;i<4;i++){
                            let playingCoordinate = rightSegment.playing[i];
                            let pausedCoordinate = rightSegment.paused[i];

                            context2D.lineTo(
                                playingCoordinate[0] + (pausedCoordinate[0] - playingCoordinate[0]) * animationFactor,
                                playingCoordinate[1] + (pausedCoordinate[1] - playingCoordinate[1]) * animationFactor,
                            );
                        }

                        context2D.closePath();

                        context2D.fillStyle = backgroundColor.toStyle();
                        context2D.strokeStyle = backgroundColor.toStyle();
                        context2D.fill();
                        context2D.stroke();
                    }

                    context2D.restore();

                }
                

            }
            {
                context2D.beginPath();
                context2D.roundRect(cBP.x + cBP.width - cBP.timeLengthStringWidth, cBP.y - 35, cBP.timeLengthStringWidth, cBP.height, 25);
                context2D.closePath();

                context2D.fillStyle = foregroundColor.toStyle();
                context2D.fill();

                let leftBounds = actualX + cBP.timePatternBoxWidth - 12;
                let topBounds = cBP.y - 35;
                let bottomBounds = cBP.y - 35 + cBP.height;
                let rightBounds = cBP.x + cBP.width - cBP.timeLengthStringWidth + 12;
                let stretchedFactor = Math.min(1, (Math.abs(leftBounds - rightBounds) - 24) / 50);

                let tPDE = cBP.timePositionDragElement;
                if (stretchedFactor < 1 && tPDE.animationFactor == 0){
                    context2D.moveTo(leftBounds, topBounds);
                    context2D.bezierCurveTo(leftBounds + 25, topBounds + 18 * stretchedFactor, rightBounds - 25, topBounds + 18 * stretchedFactor, rightBounds, topBounds);
                    context2D.lineTo(rightBounds, bottomBounds);
                    context2D.bezierCurveTo(rightBounds - 25, bottomBounds - 18 * stretchedFactor, leftBounds + 25, bottomBounds - 18 * stretchedFactor, leftBounds, bottomBounds);
                    context2D.lineTo(leftBounds, topBounds);
                    context2D.closePath();
    
                    context2D.fill();
                }
                context2D.fillStyle = backgroundColor.toStyle();

                context2D.textAlign = "center";
                context2D.textBaseline = "middle";
                context2D.fillText(cBP.timeLengthString, cBP.x + cBP.width - cBP.timeLengthStringWidth / 2, cBP.y - 35 + cBP.height / 2);

            }
            {
                let dftContent = DrawingRunTime.renderObjects.DFTContent;

                context2D.save();
                
                context2D.beginPath();
                context2D.roundRect(dftContent.x, dftContent.y, dftContent.width, dftContent.height, 25);
                context2D.closePath();

                let timeFactor = Math.min(1, (Date.now() - dftContent.timeSinceEnabled) / 1000);
                let animationFactor = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor));
                
                
                let linearGradient = context2D.createLinearGradient(dftContent.x + dftContent.width * 0.05 + dftContent.width * 1 / 50, 0, dftContent.x + dftContent.width * 0.9, 0);

                let timeFactor3 = Math.min(1, (Date.now() - dftContent.timeSinceAudioSample) / 75);
                let animationFactor3 = timeFactor3;

                if (dftContent.enabled == false){
                    animationFactor = 1 - animationFactor;
                }

                for (let i = 0;i<12;i++){

                    let previousLoudness = dftContent.previousAudioSample[Math.round(i / 12 * 50)];
                    let currentLoudness = dftContent.currentAudioSample[Math.round(i / 12 * 50)];

                    if (previousLoudness && currentLoudness){
                        let loudness = Math.pow(previousLoudness + (currentLoudness - previousLoudness) * animationFactor3, 2);
                        linearGradient.addColorStop(i / 12, ColorMixer.newOpacity(ColorMixer.lerp(backgroundColor, foregroundColor, loudness * .9 * animationFactor), 0.2).toStyle());
                    }else{
                        linearGradient.addColorStop(i / 12, ColorMixer.newOpacity(backgroundColor, 0.2).toStyle());
                    }
                }

                if (dftContent.enabled == false){
                    animationFactor = 1 - animationFactor;
                }
                
                context2D.fillStyle = linearGradient;
                context2D.shadowBlur = 15;
                context2D.shadowOffsetX = -4;
                context2D.shadowOffsetY = -4;
                context2D.shadowColor = ColorMixer.newOpacity(ColorMixer.brighten(backgroundColor), 1).toStyle();
                context2D.fill();
                context2D.shadowBlur = 15;
                context2D.shadowOffsetX = 4;
                context2D.shadowOffsetY = 4;
                context2D.shadowColor = ColorMixer.newOpacity(ColorMixer.darken(backgroundColor), 1).toStyle();
                context2D.fill();
                
                context2D.clip();

                context2D.shadowBlur = 0;
                context2D.shadowColor = ColorMixer.newOpacity(ColorMixer.darken(backgroundColor), 0).toStyle();

                let playing = BackgroundTasks.currentSpotifyState?.playState;

                if (dftContent.enabled == false){
                    animationFactor = 1 - animationFactor;
                }

                if (animationFactor < 1){
                    context2D.fillStyle = ColorMixer.newOpacity(foregroundColor, 1 - animationFactor).toStyle();
                    context2D.textAlign = "center";
                    context2D.textBaseline = "middle";
                    context2D.font = `bold 40px Sauce Code Pro`;
                    context2D.fillText("󰺣 DFT Engine", dftContent.x + dftContent.width / 2, dftContent.y + dftContent.height / 2 - 10 + 50 * animationFactor);
                    context2D.font = `20px Sauce Code Pro`;
                    context2D.fillText(playing ? "No Audio Detected" : "Disabled Automatically", dftContent.x + dftContent.width / 2, dftContent.y + dftContent.height / 2 + 30 + 50 * animationFactor);
                }
                
                if (Date.now() - dftContent.timeSinceAudioSample > 75 && dftContent.samples > 0){
                    for (let i = 0;i<50;i++){
                        dftContent.previousAudioSample[i] = dftContent.currentAudioSample[i];
                    }
                    for (let i = 0;i<50;i++){
                        dftContent.currentAudioSample[i] = Math.max(dftContent.rawAudioSample[i * 2], dftContent.rawAudioSample[i * 2 + 1] ) / dftContent.samples;
                    }
                    dftContent.samples = 0;
                    dftContent.rawAudioSample = [];
                    dftContent.timeSinceAudioSample = Date.now();
                }
                if (animationFactor > 0){

                    let timeFactor3 = Math.min(1, (Date.now() - dftContent.timeSinceAudioSample) / 100);
                    let animationFactor3 = AnimationTween.jadeTween(timeFactor3);

                    let actualWidth = dftContent.width * 0.9;
                    for (let i = 0;i<50;i++){
                        let barWidth = actualWidth * 1 / 50;
                        let previousLoudness = dftContent.previousAudioSample[i];
                        let currentLoudness = dftContent.currentAudioSample[i];

                        let loudness = previousLoudness + (currentLoudness - previousLoudness) * animationFactor3;

                        loudness = (Math.pow(loudness, 2) * 0.5 + loudness * 0.75) / 1.25;
    
                        context2D.fillStyle = ColorMixer.newOpacity(ColorMixer.lerp(ColorMixer.darken(foregroundColor), ColorMixer.brighten(foregroundColor), loudness), animationFactor).toStyle();
    
                        context2D.beginPath();
                        context2D.roundRect( 
                            - actualWidth / 2 + dftContent.width / 2 + dftContent.x + barWidth * i, 
                            dftContent.height * 0.9 + dftContent.y, 
                            barWidth,
                            loudness * - dftContent.height * .8 * animationFactor, 10);
                        context2D.closePath();
                        context2D.fill();
                    }
                }

                context2D.restore();

            }

            {
                let songContent = DrawingRunTime.renderObjects.SongContent;
                let dftContent = DrawingRunTime.renderObjects.DFTContent;
                let currentTimePosition = 0;
                let lyricalState: LyricalState | undefined = undefined;
                
                if (BackgroundTasks.currentSpotifyState && BackgroundTasks.currentJadeLyrics){
                    let tPDE = cBP.timePositionDragElement;
                    currentTimePosition = tPDE.currentTimePosition + .1;//- 0.05;//- .05;

                    // if (dftContent.enabled == false){
                    //     currentTimePosition += 0.24;
                    // }
                    if (BackgroundTasks.currentSpotifyState.playState == false){
                        currentTimePosition = BackgroundTasks.currentSpotifyState.timePosition;
                    }
                    lyricalState = LyricalPlayer.getLyricalState(BackgroundTasks.currentJadeLyrics, currentTimePosition);
                    
                    if (lyricalState.wordStartTime != DrawingRunTime.previousTimingState){
                        DrawingRunTime.previousTimingState = lyricalState.wordStartTime;
                        DrawingRunTime.characterTiming = [];

                        for (let i = 0;i<lyricalState.mainLine.length;i++){
                            DrawingRunTime.characterTiming.push(-1);
                        }
                    }
                }

                let timeFactor = Math.min(1, (Date.now() - TimingState.timeSinceJadeLyricsLoaded) / 1000);
                let animationFactor = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor));


                if (BackgroundTasks.jadeLyricsSupported == false){
                    animationFactor = 1 - animationFactor;
                }
                
                let transitionAnimationFactor = animationFactor;
                
                context2D.save();
                
                context2D.beginPath();
                context2D.roundRect(songContent.x, songContent.y, songContent.width, songContent.height, 25);
                context2D.closePath();
                
                
                context2D.fillStyle = ColorMixer.newOpacity(backgroundColor, 0.2).toStyle();
                context2D.shadowBlur = 15;
                context2D.shadowOffsetX = -4;
                context2D.shadowOffsetY = -4;
                context2D.shadowColor = ColorMixer.newOpacity(ColorMixer.brighten(backgroundColor), 1).toStyle();
                context2D.fill();
                context2D.shadowBlur = 15;
                context2D.shadowOffsetX = 4;
                context2D.shadowOffsetY = 4;
                context2D.shadowColor = ColorMixer.newOpacity(ColorMixer.darken(backgroundColor), 1).toStyle();
                context2D.fill();

                context2D.clip();

                
                context2D.shadowBlur = 0;
                context2D.shadowColor = ColorMixer.newOpacity(ColorMixer.darken(backgroundColor), 0).toStyle();

                if (lyricalState){

                    let fontSeperator = 30;

                    function isSubLine(line: string){
                        return line.match(/^\(.+\) ?$/) !=  null;
                    }

                    function fontAdjust(line: string){

                        if (isSubLine(line)){
                            context2D.font = `italic 800 20px Sauce Code Pro`;
                            return line.match(/\((.+)\)/)![1];
                        }else{
                            context2D.font = `bold 25px Sauce Code Pro`;
                            return line;
                        }
                    }

                    let timeFactor = Math.max(0, Math.min(1, (currentTimePosition - lyricalState.lineStartTime) / 1));
                    let animationFactor = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor));

                    let timeFactor4 = Math.max(0, Math.min(1, (currentTimePosition - (lyricalState.wordEndTime + 4)) / 1));
                    let timeFactor5 = Math.max(0, Math.min(1, (currentTimePosition - (lyricalState.wordStartTime - 2)) / 1));


                    let animationFactor4 = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor4));
                    let animationFactor5 = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor5));

                    let animationFactor3 = (lyricalState.futureLine ? 1 : 1 - animationFactor4) * (animationFactor5);

                    let currentHeight = songContent.y + songContent.height;

                    context2D.fillStyle = ColorMixer.newOpacity(foregroundColor, .4 * animationFactor3).toStyle();
                    context2D.textAlign = "left";
                    let mainLineHeight = 0;
                    if (lyricalState.futureLine){
                        let timeFactor = Math.max(0, Math.min(1, (currentTimePosition - lyricalState.lineStartTime) / 2));
                        let animationFactor = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor));

                        currentHeight += 2 * fontSeperator * (1 - animationFactor);
                        currentHeight -= fontSeperator;
                        context2D.fillText(fontAdjust(lyricalState.futureLine), songContent.x + 25 + (isSubLine(lyricalState.futureLine) ? - context2D.measureText(lyricalState.futureLine).width + songContent.width - 25 : 0), currentHeight);
                    }
                    
                    let scaleUp = 1 + 1.5 * animationFactor;
                    let wrapResults = WrapEngine.attemptWrap(context2D, fontAdjust(lyricalState.mainLine), songContent.width / 2.5);
                    let lines = (wrapResults.match(/\n/g)?.length || 0) + 1;

                    let from = fontSeperator;
                    let to = lines * fontSeperator * scaleUp;


                    if (lyricalState.mainLine){
                        mainLineHeight = from + (to - from) * animationFactor;
                    }

                    currentHeight -= mainLineHeight;

                    context2D.scale(scaleUp, scaleUp);


                    let index = 0;
                    let characters = lyricalState.mainLine.length;
                    let pinX = (songContent.x + 25 )/ scaleUp;
                    let pinY = currentHeight / scaleUp;
                    let y = 0;
                    let subline = isSubLine(lyricalState.mainLine) && lyricalState.wordStartTime <= currentTimePosition;

                    if (subline != DrawingRunTime.showingSubline){
                        DrawingRunTime.showingSubline = subline;
                        DrawingRunTime.timeSinceSublineChange = Date.now();
                    }
                    for (let line of wrapResults.split(/\n/)){
                        context2D.translate(pinX, pinY);
                        if (DrawingRunTime.showingSubline){
                        }else
                            context2D.rotate(- Math.PI / 32 * AnimationTween.bounce(animationFactor));
                        context2D.translate(12 * AnimationTween.bounce(animationFactor), 12 * AnimationTween.bounce(animationFactor));
                        let x = (isSubLine(lyricalState.mainLine) ? - context2D.measureText(line).width * scaleUp + songContent.width - 25 : 0);

                        let shadowLine = "";
                        let visibleLine = "";
                        
                        let prevX = x;

                        for (let character of line.split("")){
                            index += 1;
                            let characterWidth = (context2D.measureText(character).width) * scaleUp
                            let endProgressState = index / characters;
                            let startProgressState = (index - 1) / characters;

                            let progressionState = Math.max(0, Math.min(1, (lyricalState.lineProgresPercentage - startProgressState) / (endProgressState - startProgressState)));

                            let progressionStateNormalized = 0;

                            if (DrawingRunTime.characterTiming[index - 1] != -1){
                                let wordDuration = (lyricalState.currentWordEndTime - lyricalState.currentWordStartTime) * 1000;

                                if (wordDuration != DrawingRunTime.currentWordDuration){
                                    DrawingRunTime.previousWordDuration = DrawingRunTime.currentWordDuration;
                                    DrawingRunTime.currentWordDuration = wordDuration;
                                    DrawingRunTime.timeSinceWordDurationChange = Date.now();
                                }

                                wordDuration = DrawingRunTime.previousWordDuration + (DrawingRunTime.currentWordDuration - DrawingRunTime.previousWordDuration) * Math.min(1, (Date.now() - DrawingRunTime.timeSinceWordDurationChange) / 500);

                                progressionStateNormalized = Math.max(0, Math.min(1, (Date.now() - DrawingRunTime.characterTiming[index - 1]) / (400 + wordDuration)));
                                progressionStateNormalized = AnimationTween.jadeTween(progressionStateNormalized);
                            }

                            if (!Number.isFinite(progressionState)){
                                progressionState = 1;
                            }

                            //TODO: Properly render "inactive_before" text when safari's developers (idiots) release letter spacing into its canvas api.
                            // let characterSizing = .9 + .2 * AnimationTween.bounce(progressionStateNormalized) + .1 * progressionState;
                            let characterSizing = 1 + .2 * AnimationTween.bounce(progressionStateNormalized);

                            let xTranslation = x / scaleUp / characterSizing - 2 * AnimationTween.bounce(progressionStateNormalized) * (isSubLine(lyricalState.mainLine) ? -1 : 1);
                            let yTranslation = y / scaleUp / characterSizing - 8 * AnimationTween.bounce(progressionStateNormalized);


                            let renderTextMode: "active" | "inactive_before" | "inactive_after" = "active";

                            if (progressionState >= 1){
                                if (DrawingRunTime.characterTiming[index - 1] == -1){
                                    DrawingRunTime.characterTiming[index - 1] = Date.now();
                                }
                                if (progressionStateNormalized >= 1){
                                    renderTextMode = "inactive_after";
                                }
                                context2D.fillStyle = ColorMixer.newOpacity(ColorMixer.lerp(ColorMixer.lerp(foregroundColor, textColor, .5), foregroundColor, 0.5 * progressionStateNormalized), 1 * animationFactor3).toStyle();
                            }else{
                                if (progressionState <= 0){
                                    DrawingRunTime.characterTiming[index - 1] = -1;
                                    renderTextMode = "inactive_before";
                                    context2D.fillStyle = ColorMixer.newOpacity(foregroundColor, 0.4 * animationFactor3).toStyle();
                                }else{
                                    if (DrawingRunTime.characterTiming[index - 1] == -1){
                                        DrawingRunTime.characterTiming[index - 1] = Date.now();
                                    }
                                    let linearGradient = context2D.createLinearGradient(-10, 0, characterWidth + 10, 0);
                                    let primaryColor = ColorMixer.newOpacity(ColorMixer.lerp(ColorMixer.lerp(foregroundColor, textColor, .5), foregroundColor, 0.5 * progressionStateNormalized), 1 * animationFactor3).toStyle();
                                    let secondaryColor = ColorMixer.newOpacity(foregroundColor, 0.3 * animationFactor3).toStyle();
                                    // linearGradient.addColorStop(progressionState * 0.95 + 0.04, ColorMixer.newOpacity(foregroundColor, 0.4 * animationFactor3).toStyle());
                                    linearGradient.addColorStop(progressionState * 0.75, primaryColor);
                                    linearGradient.addColorStop(progressionState * 0.75 + 0.25, secondaryColor);
                                    context2D.fillStyle = linearGradient
                                }
                            }

                            if (renderTextMode == "active"){
                                context2D.scale(characterSizing, characterSizing);
                                context2D.translate(xTranslation, yTranslation);
                                context2D.rotate(Math.PI / 64 * AnimationTween.bounce(progressionStateNormalized));
                                let bright = DynamicPrimaryColorEngine.measureRelvance(foregroundColor, backgroundColor) > 0.1;
                                context2D.shadowBlur = 15 * AnimationTween.bounce(progressionStateNormalized) * (bright ? .5 : 1);
                                context2D.shadowOffsetX = 0;
                                context2D.shadowOffsetY = 0;
                                context2D.shadowColor = ColorMixer.newOpacity(foregroundColor,  AnimationTween.bounce(progressionStateNormalized) * (bright ? .75: 1)).toStyle();
                                context2D.fillText(character, 6 * AnimationTween.bounce(progressionStateNormalized) * (isSubLine(lyricalState.mainLine) ? -1 : 1), 8 * AnimationTween.bounce(progressionStateNormalized));
                                context2D.rotate(- Math.PI / 64 * AnimationTween.bounce(progressionStateNormalized));
                                context2D.translate(-xTranslation, -yTranslation);
                                context2D.scale(1 / characterSizing, 1 / characterSizing);
                                context2D.shadowBlur = 0;
                                context2D.shadowColor = Color.immediate(0, 0, 0, 0);
                                shadowLine += " ";
                                visibleLine += " ";
                            }else{
                                switch(renderTextMode){
                                    case "inactive_before":{
                                        visibleLine += " ";
                                        shadowLine += character;
                                        break;
                                    }
                                    case "inactive_after":{
                                        shadowLine += " ";
                                        visibleLine += character;
                                        break;
                                    }
                                }
                            }
                            x += characterWidth;
                        }
                        context2D.fillStyle = ColorMixer.newOpacity(foregroundColor, 0.4 * animationFactor3).toStyle();
                        //TODO: Properly render "inactive_before" text when safari's developers (idiots) release letter spacing into its canvas api.
                        context2D.fillText(shadowLine, prevX / scaleUp, y / scaleUp);
                        context2D.fillStyle = ColorMixer.newOpacity(ColorMixer.lerp(ColorMixer.lerp(foregroundColor, textColor, .5), foregroundColor, 0.5), 1 * animationFactor3).toStyle();
                        context2D.fillText(visibleLine, prevX / scaleUp, y / scaleUp);
                        context2D.translate(-12 * AnimationTween.bounce(animationFactor), - 12 * AnimationTween.bounce(animationFactor));
                        if (DrawingRunTime.showingSubline){
                        }else
                            context2D.rotate(Math.PI / 32 * AnimationTween.bounce(animationFactor));
                        context2D.translate(-pinX, -pinY);
                        y += scaleUp * (Number(context2D.font.match(/(\d+)px/)![1]) + 5);
                    }
                    context2D.scale(1 / scaleUp, 1 / scaleUp);

                    {
                        let actualLine = lyricalState.historicalLines[lyricalState.historicalLines.length - 2];
                        let line = fontAdjust(actualLine);
                        context2D.fillStyle = ColorMixer.newOpacity(foregroundColor, .75 * animationFactor3).toStyle();
                        let wrapResults = WrapEngine.attemptWrap(context2D, line, songContent.width / 2.5);
                        let lines = (wrapResults.match(/\n/g)?.length || 0) + 1;

                        let scaleDown = 2.5 - 1.5 * animationFactor;

                        let to = (Number(context2D.font.match(/(\d+)px/)![1])) + 30;
                        let from = lines * (Number(context2D.font.match(/(\d+)px/)![1])) * scaleDown;

                        mainLineHeight += from + (to - from) * animationFactor;
                        currentHeight -= from + (to - from) * animationFactor;
                        context2D.scale(scaleDown, scaleDown);
                        if (isSubLine(actualLine))
                            context2D.textAlign = "right";
                        context2D.fillText(line, (songContent.x + 25 + (isSubLine(actualLine) ? + songContent.width - 50: 0)) / scaleDown, currentHeight / scaleDown);
                        context2D.scale(1 / scaleDown, 1 / scaleDown);
                        context2D.textAlign = "left";

                    }


                    


                    let pastLineHeight = 0;
                    for (let i = lyricalState.historicalLines.length - 3;i>=0;i--){

                        let timeFactor9 = Math.max(0, Math.min(1, (currentTimePosition - lyricalState.lineStartTime - (lyricalState.historicalLines.length - 3 - i) * 0.075) / 1));
                        let animationFactor9 = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor9));
                        currentHeight -= ((Number(context2D.font.match(/(\d+)px/)![1])) + 25 );
                        let line = lyricalState.historicalLines[i];
                        context2D.fillText(fontAdjust(line), songContent.x + 25 + (isSubLine(line) ? - context2D.measureText(line).width + songContent.width - 25 : 0), currentHeight + ((Number(context2D.font.match(/(\d+)px/)![1])) + 25 ) * (1 - animationFactor9));
                        if (line)
                            pastLineHeight += (Number(context2D.font.match(/(\d+)px/)![1])) + 25;
                    }

                    pastLineHeight = Math.min(pastLineHeight, 300);

                    let primaryLyricsContent = (50 + mainLineHeight + pastLineHeight);

                    primaryLyricsContent += (150 - primaryLyricsContent) * (1 - animationFactor3);

                    
                    songContent.height = primaryLyricsContent * transitionAnimationFactor;
                    songContent.previousHeight = songContent.height;

                    context2D.fillStyle = ColorMixer.newOpacity(foregroundColor, 1 - animationFactor3).toStyle();

                    let timeTillStart = Math.max(0, Math.min(10, lyricalState.wordStartTime - currentTimePosition));
                    let timeFactor6 = Math.max(0, Math.min(1, (currentTimePosition - (lyricalState.wordStartTime - 0.5)) / 1));
                    let timeFactor6_1 = Math.max(0, Math.min(1, (currentTimePosition - (lyricalState.wordStartTime - 10)) / 1));
                    let timeFactor6_2 = Math.max(0, Math.min(1, (currentTimePosition - (lyricalState.wordStartTime - .5)) / 2));

                    let animationFactor6_2 = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor6_2));
                    let animationFactor6 = (1 - AnimationTween.jadeTween(AnimationTween.exponential(timeFactor6))) * AnimationTween.jadeTween(AnimationTween.exponential(timeFactor6_1));

                    if (songContent.showJadeLyrics != animationFactor6 < .5){
                        songContent.showJadeLyrics = animationFactor6 < .5;
                        songContent.timeSinceJadeLyricsShow = Date.now();
                    }
                    let timeFactor6_3 = Math.max(0, Math.min(1, (Date.now() - songContent.timeSinceJadeLyricsShow) / 1000));
                    animationFactor6 = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor6_3));

                    if (songContent.showJadeLyrics){
                        animationFactor6 = 1 - animationFactor6;
                    }

                    let animationFactor7 = AnimationTween.jadeTween(AnimationTween.exponential((1 - timeTillStart % 1)));
                    let animationFactor8 = AnimationTween.bounce(AnimationTween.jadeTween((1 - timeTillStart % 1)));

                    context2D.textAlign = "center";
                    context2D.textBaseline = "middle";
                    context2D.font = `bold 40px Sauce Code Pro`;
                    context2D.fillText("󰍰 Jade Lyrics", songContent.x + songContent.width / 2, songContent.y + songContent.height / 2 - 50 * animationFactor6 - 1 * animationFactor8);

                    context2D.fillStyle = ColorMixer.newOpacity(foregroundColor, animationFactor6).toStyle();
                    context2D.beginPath();
                    context2D.arc(songContent.x + songContent.width / 2, songContent.y + songContent.height / 2 + 20 * (1 - animationFactor3), 40 + 5 * animationFactor8 + 1200 * animationFactor6_2, 0, 2 * Math.PI);
                    context2D.closePath();
                    context2D.clip();
                    context2D.fill();


                    let transformX = 80 * (1 - animationFactor7);
                    let x_1 = songContent.x + songContent.width / 2;
                    let y_1 = songContent.y + songContent.height / 2 + 20 * (1 - animationFactor3);
                    if (timeFactor6_2 == 0){
                        let scaleDown = .5 + 0.5 * (1 - animationFactor7);

                        context2D.scale(scaleDown, scaleDown);
                        context2D.fillStyle = ColorMixer.newOpacity(backgroundColor, animationFactor6).toStyle();
                        context2D.fillText(`${Math.floor(timeTillStart + 1)}`, (x_1 + 80 - transformX) / scaleDown, y_1 / scaleDown);
                        context2D.scale(1 / scaleDown, 1 / scaleDown);
                        cBP.extraString = `Lyrics in ${Math.floor(lyricalState.wordStartTime - currentTimePosition)} seconds `;
                    }else{
                            if (lyricalState.endOfLyrics && lyricalState.wordEndTime <= currentTimePosition - 4){
                                cBP.extraString = "";
                            }else{
                                cBP.extraString = lyricalState.mainLine;
                            }
                    }
                    {
                        let scaleUp = .5 + 0.5 * animationFactor7 + 2 * animationFactor6_2;

                        context2D.scale(scaleUp, scaleUp);
                        context2D.fillStyle = ColorMixer.newOpacity(backgroundColor, animationFactor6).toStyle();
                        context2D.fillText(`${Math.floor(timeTillStart)}`, (x_1 - transformX) / scaleUp, y_1 / scaleUp);
                        context2D.scale(1 / scaleUp, 1 / scaleUp);
                    }

                }else{
                    songContent.height = songContent.previousHeight * transitionAnimationFactor;
                }
                
                context2D.restore();
                
            }

            let tPDE = DrawingRunTime.renderObjects.ControlBar.timePositionDragElement;

            if (tPDE.currentTimePosition < 5 && BackgroundTasks.currentSpotifyState){
                let trackName = BackgroundTasks.currentSpotifyState.trackName;
                let artistName = BackgroundTasks.currentSpotifyState.artistName;
                cBP.extraString = `Playing ${trackName} by ${artistName} `;
            }else if(!BackgroundTasks.currentJadeLyrics){
                cBP.extraString = "";
            }
            
            let gradient1 = context2D.createLinearGradient(0, 0, 0, 50);
            gradient1.addColorStop(0, backgroundColor.toStyle());
            gradient1.addColorStop(0, ColorMixer.newOpacity(backgroundColor, 0).toStyle());

            context2D.fillStyle = gradient1;

            context2D.fillRect(0, 0, maxWidth, 50);

            let gradient = context2D.createLinearGradient(-300, 0, 600, 0);


            for (let i = 0;i<5;i++){
                gradient.addColorStop((i / 5 + (Date.now() / 5000)) % 1, (i + 1) % 2 == 0 ? ColorMixer.lerp(backgroundColor, foregroundColor, .5).toStyle() : ColorMixer.lerp(backgroundColor, foregroundColor, .9).toStyle());
            }

            context2D.fillStyle = gradient;
            context2D.strokeStyle = gradient;
            

            context2D.textAlign = "left";
            context2D.textBaseline = "middle";
            context2D.font = `bold 18px Sauce Code Pro`;
            context2D.fillText("Music Visualizer 2.0", 85, 16);
            context2D.font = `bold 15px Sauce Code Pro`;
            context2D.fillText("by thejades", 320, 16);

            context2D.lineWidth = 3;

            context2D.scale(0.5, 0.5);
            context2D.translate(150, -1);

            context2D.beginPath();
            context2D.lineJoin = "round";
            context2D.moveTo(0, 10);
            context2D.lineTo(- 10, 30);
            context2D.lineTo(0, 44);
            context2D.lineTo(10, 30);
            context2D.closePath();
            context2D.stroke();

            context2D.lineWidth = 2;

            context2D.beginPath();
            context2D.lineJoin = "bevel";
            context2D.moveTo(10, 30);
            context2D.lineTo(0, 34);
            context2D.lineTo(- 10, 30);

            context2D.moveTo(0, 10);
            context2D.lineTo(0, 44);
            context2D.stroke();

            context2D.translate(-150, 1);
            context2D.scale(1 / 0.5, 1 / 0.5);
            
            context2D.fillStyle = foregroundColor.toStyle();
            context2D.font = `bold 18px Sauce Code Pro`;
            DrawingRunTime.averageFrameRate = DrawingRunTime.averageFrameRate * 0.75 + 1000 / DrawingRunTime.intervalFrameDelay * 0.25;
            context2D.fillText(`FPS: ${Math.round(DrawingRunTime.averageFrameRate)}`, maxWidth - 250, 16);

            if (Date.now() - DrawingRunTime.timeSinceFrameRateSample > 100){
                DrawingRunTime.timeSinceFrameRateSample = Date.now();
                DrawingRunTime.frameRateHistory.push(DrawingRunTime.averageFrameRate);

                if (DrawingRunTime.frameRateHistory.length >= 100){
                    DrawingRunTime.frameRateHistory.shift();
                }
            }

            let maxValue = 0;
            let minValue = 0;

            for (let value of DrawingRunTime.frameRateHistory){
                maxValue = Math.max(value, maxValue);
                minValue = Math.min(value, minValue);
            }

            let x = maxWidth - 150;
            let y = 5;
            let width = 125;
            let height = 20;

            context2D.beginPath();
            context2D.moveTo(x, y);
            context2D.strokeStyle = foregroundColor.toStyle();

            for (let i = 0;i<DrawingRunTime.frameRateHistory.length;i++){
                let value = DrawingRunTime.frameRateHistory[i];

                let x_i = x + i / (DrawingRunTime.frameRateHistory.length - 1) * width;
                let y_i = y + height * (1 - (value - minValue) / (maxValue - minValue));

                context2D.lineTo(x_i, y_i);
            }
            context2D.stroke();
            context2D.lineTo(x + width, y + height);
            context2D.lineTo(x, y + height);
            context2D.lineTo(x, y);
            let gradient_2 = context2D.createLinearGradient(0, y, 0, y + height);
            gradient_2.addColorStop(0, foregroundColor.toStyle());
            gradient_2.addColorStop(.75, ColorMixer.newOpacity(foregroundColor, 0).toStyle());
            context2D.fillStyle = gradient_2;
            context2D.fill();

            // {
            //     let currentSpotifyState = BackgroundTasks.currentSpotifyState;
    
            //     if (currentSpotifyState && BackgroundTasks.currentJadeLyrics){
            //         let currentTimePosition = currentSpotifyState.timePosition + (Date.now() - currentSpotifyState.timeFeteched) / 1000;
            //         let currentTimeIndex = Math.floor((currentTimePosition + 0.5) * 8);

            //         let lyricsPortition = BackgroundTasks.currentJadeLyrics.lyricalLinesTimeReferences[currentTimeIndex];

            //         if (lyricsPortition){
            //             let aBP = DrawingRunTime.renderObjects.AlbumCover;
            //             context2D.textAlign = "center";
            //             context2D.textBaseline = "middle";
            //             context2D.font = "bold 30px Sauce Code Pro";
            //             context2D.fillStyle = foregroundColor.toStyle();
            //             context2D.fillText(lyricsPortition.line, maxWidth / 2, aBP.height + 30 + aBP.y);
            //         }
            //     }
            // }

            // LAYOUT
            // PLAY CONTROLS -------------------- TIME ---------------------------- TIME LENGTH

            
            {
                context2D.save();
                context2D.font = "bold 20px Sauce Code Pro";

                let tPDE = cBP.timePositionDragElement;
                let animationFactor = tPDE.animationFactor;

                let startingXPosition = actualX;
                let startingYPosition = cBP.y - 35;

                startingXPosition += (tPDE.raw.x - cBP.timePatternBoxWidth / 2 - startingXPosition) * animationFactor * 0.75;
                startingYPosition += (Math.min(cBP.y - cBP.height, tPDE.raw.y - 50) - startingYPosition) * animationFactor;

                startingXPosition = Math.max(Math.min(cBP.x + cBP.width - 55, startingXPosition), cBP.x - 10);

                
                if (animationFactor > 0){

                    context2D.beginPath();
                    context2D.roundRect(startingXPosition + cBP.timePatternBoxWidth / 2 - 10, startingYPosition + 35, 20, cBP.y - (startingYPosition + 40), 25);
                    context2D.rect(startingXPosition + cBP.timePatternBoxWidth / 2 - 10, cBP.y - 25, 20, 25);
                    context2D.closePath();

                    context2D.fillStyle = foregroundColor.toStyle();
                    context2D.fill();

                    context2D.fillStyle = ColorMixer.newOpacity(backgroundColor, .8 * animationFactor).toStyle();
                    context2D.fillRect(0, 0, maxWidth, maxHeight);

                }

                context2D.beginPath();
                context2D.roundRect(startingXPosition, startingYPosition, cBP.timePatternBoxWidth, cBP.height, 25);
                context2D.closePath();

                context2D.clip();
                
                context2D.fillStyle = foregroundColor.toStyle();
                context2D.fill();
                

                context2D.fillStyle = backgroundColor.toStyle();
                context2D.textBaseline = "middle";
                context2D.textAlign = "right";


                let startingX = startingXPosition + cBP.timePatternBoxWidth / 2 + cBP.timeStringWidth / 2;

                let transitionAnimationFactor = AnimationTween.jadeTween(AnimationTween.exponential(cBP.subSecondProgressBar));

                for (let i = 0;i<=Math.max(cBP.timeString.length, cBP.previousTimeString.length);i++){
                    let newCharacter = cBP.timeString[cBP.timeString.length - i - 1] || " ";
                    let oldCharacter = cBP.previousTimeString[cBP.previousTimeString.length - i - 1] || " ";

                    if (newCharacter != oldCharacter){
                        context2D.fillText(oldCharacter, startingX, startingYPosition + cBP.height / 2 + cBP.height * transitionAnimationFactor);
                        context2D.fillText(newCharacter, startingX, startingYPosition + cBP.height / 2 - cBP.height + cBP.height * transitionAnimationFactor - 1);
                        startingX -= context2D.measureText(oldCharacter).width;
                    }else{
                        context2D.fillText(oldCharacter, startingX, startingYPosition + cBP.height / 2);
                        startingX -= context2D.measureText(oldCharacter).width;
                    }
                }

                context2D.restore();
                
                if (BackgroundTasks.currentSpotifyState && animationFactor > 0){
                    let actualSpotifyX = BackgroundTasks.currentSpotifyState.timePosition / BackgroundTasks.currentSpotifyState.timeLength *
                        cBP.width + cBP.x;

                    if (Math.abs(actualSpotifyX - tPDE.previousSpotifyPositionX) > 50){
                        tPDE.anchorSpotifyPositionX = tPDE.previousSpotifyPositionX;
                        tPDE.previousSpotifyPositionX = actualSpotifyX;
                        tPDE.timeSinceSpotifyTimeChange = Date.now();
                    }
                    let timeFactor = Math.max(Math.min(1, (Date.now() - tPDE.timeSinceSpotifyTimeChange) / 1000), 0);
                    let animationFactor = AnimationTween.jadeTween(AnimationTween.exponential(timeFactor));

                    actualSpotifyX = tPDE.anchorSpotifyPositionX + (tPDE.previousSpotifyPositionX - tPDE.anchorSpotifyPositionX) * animationFactor;
    
                    let displacementWidth = Math.abs(actualSpotifyX - startingXPosition);
                    let displacementDirection = Math.sign(actualSpotifyX - (startingXPosition)) * 25;
    
                    let length = Math.ceil(Math.abs(displacementWidth) / 25);

                    for (let i = 1;i<length;i++){
                        context2D.beginPath();
    
                        let positionalFactor = Math.min(1, Math.max(0, 1 - (i + 3 - length) / (Math.abs(displacementWidth) / 25)));

                        context2D.fillStyle = ColorMixer.newOpacity(backgroundColor, positionalFactor).toStyle();
                        context2D.strokeStyle = ColorMixer.newOpacity(foregroundColor, positionalFactor).toStyle();
                        context2D.lineWidth = 8;
                        context2D.lineJoin = "round";

                        let x = startingXPosition + i * displacementDirection + cBP.timePatternBoxWidth / 2 
                            + displacementDirection * (positionalFactor);
                        let y = startingYPosition + 15;
    
                        context2D.moveTo(x, y - 5 * positionalFactor);
                        context2D.lineTo(x - displacementDirection * 0.4 * positionalFactor, y);
                        context2D.lineTo(x, y + 5 * positionalFactor);
    
                        context2D.closePath();
                        context2D.stroke();
                        // context2D.fill();
                    }
                    context2D.lineWidth = 3;
                }


            }



            // context2D.clip();
        }

        {
            context2D.textRendering = "geometricPrecision";
            context2D.textAlign = "center";
            context2D.textBaseline = "middle";
            context2D.beginPath();
            context2D.arc(14, 14, 6, 0, 2 * Math.PI);
            context2D.closePath();
            context2D.fillStyle = foregroundColor.toStyle();
            context2D.fill();
            
            context2D.strokeStyle = backgroundColor.toStyle();
            context2D.lineWidth = 2;
            context2D.lineCap = "round";
            context2D.beginPath();
            context2D.moveTo(14 + 3, 14 + 3);
            context2D.lineTo(14 - 3, 14 - 3);
            context2D.closePath();
            context2D.stroke();

            context2D.beginPath();
            context2D.moveTo(14 - 3, 14 + 3);
            context2D.lineTo(14 + 3, 14 - 3);
            context2D.closePath();
            context2D.stroke();


            context2D.beginPath();
            context2D.arc(14 + 20, 14, 6, 0, 2 * Math.PI);
            context2D.closePath();
            context2D.fillStyle = foregroundColor.toStyle();
            context2D.fill();

            context2D.fillStyle = backgroundColor.toStyle();
            context2D.beginPath();
            context2D.roundRect(10 + 20, 13, 8, 2, 3);
            context2D.closePath();
            context2D.fill();

            context2D.beginPath();
            context2D.arc(14 + 40, 14, 6, 0, 2 * Math.PI);
            context2D.closePath();
            context2D.fillStyle = foregroundColor.toStyle();
            context2D.fill();

            context2D.fillStyle = backgroundColor.toStyle();
            context2D.lineJoin = "round";
            context2D.beginPath();
            
            context2D.moveTo(14 + 40 - 3, 14 - 3);
            context2D.lineTo(14 + 40 + 2, 14 - 3);
            context2D.lineTo(14 + 40 - 3, 14 + 2);
            context2D.closePath();
            context2D.fill();

            context2D.moveTo(14 + 40 + 3, 14 + 3);
            context2D.lineTo(14 + 40 - 2, 14 + 3);
            context2D.lineTo(14 + 40 + 3, 14 - 2);
            context2D.closePath();
            context2D.fill();
            


            context2D.textRendering = "optimizeSpeed";
        }

        DrawingRunTime.averageRenderTime = (DrawingRunTime.averageRenderTime + Date.now() - startRenderingTime) / 2;
        requestAnimationFrame(DrawingRunTime.render);
    };

    static updateWindowSize(){
        DrawingRunTime.maxWidth = window.innerWidth;
        DrawingRunTime.maxHeight = window.innerHeight;

        canvas.width = DrawingRunTime.maxWidth;
        canvas.height = DrawingRunTime.maxHeight;
        
        TimingState.timeSinceLastFrame = 0;
        // DrawingRunTime.render();

        let displayMode = DrawingRunTime.maxWidth < 1000 ? "Portrait" : "Landscape" as "Portrait" | "Landscape";

        if (DrawingRunTime.displayMode != displayMode){
            DrawingRunTime.displayMode = displayMode;
            TimingState.timeSinceDisplayModeChange = Date.now();
        }
    }

    static init(){

        let renderedBackground = false;
        // setInterval(()=>{
        //     if (renderedBackground)
        //         DrawingRunTime.render();
        // }, 1);
        DrawingRunTime.updateWindowSize();
        requestAnimationFrame(DrawingRunTime.render);

        setInterval(()=>{
            console.log(`Desired Frame Rate: ${
                DrawingRunTime.frameRate}\nSystem Capable Frame Rate: ${
                    Math.round(1000 / DrawingRunTime.intervalFrameDelay)}\nAverage Render Time: ${
                        Math.round(DrawingRunTime.averageRenderTime * 100)/100}ms\nAverage Calculation Time: ${
                            Math.round(DrawingRunTime.averageCalculationTime * 100)/100}ms`);
        }, 250);

        let body = document.body;

        let accumulativeValues: number[] = (()=>{let a = [];for (let i = 0;i<50;i++)a.push(0);return a})();

        let visualizerMode = 0;
        let beforeVisualizerMode = 0;
        let visualizerModeTween = 0;
        let timeSinceVisualizerModeChange = 0;
        let samples: number[] = [];
        let threshold = 0.4;

        setInterval(()=>{
            samples.push(DrawingRunTime.renderObjects.DFTContent.currentAudioSample[0]);

            if (Date.now() - timeSinceVisualizerModeChange > 3000 && samples.length >= 30){

                let averageLoudness = 0;

                for (let i = 0;i<samples.length;i++){
                    averageLoudness += samples[i];
                }

                if (Number.isNaN(averageLoudness)){
                    return samples = [];
                }
                
                averageLoudness /= samples.length;
                samples = [];
                let selectedVisualizerMode = 0;

                if (averageLoudness < threshold){
                    selectedVisualizerMode = 0;
                }else {
                    selectedVisualizerMode = 1;
                }

                if (selectedVisualizerMode != visualizerMode){
                    beforeVisualizerMode = visualizerMode;
                    visualizerMode = selectedVisualizerMode;
                    timeSinceVisualizerModeChange = Date.now();
                    if (selectedVisualizerMode == 1){
                        threshold = 0.1;
                    }else{
                        threshold = 0.5;
                    }
                }
            }
        }, 16)

        setInterval(()=>{
            renderedBackground = true;
            if (DrawingRunTime.backgroundCanvas.width != DrawingRunTime.maxWidth){
                DrawingRunTime.backgroundCanvas.width = DrawingRunTime.maxWidth / 2;
            }
            if (DrawingRunTime.backgroundCanvas.height != DrawingRunTime.maxHeight){
                DrawingRunTime.backgroundCanvas.height = DrawingRunTime.maxHeight / 2;
            }

            let maxWidth = DrawingRunTime.backgroundCanvas.width;
            let maxHeight = DrawingRunTime.backgroundCanvas.height;
            
            body.style.backgroundColor = DrawingRunTime.safariBackgroundColor.toStyle();

            let backgroundContext2D = DrawingRunTime.backgroundCanvas.getContext("2d")!;

            backgroundContext2D.fillStyle = DrawingRunTime.safariBackgroundColor.toStyle();
            backgroundContext2D.fillRect(0, 0, maxWidth, maxHeight);

            {
                let timeFactor = Math.min(Math.max(0, (Date.now() - timeSinceVisualizerModeChange) / 3000), 1);
                let animationFactor = AnimationTween.cos(timeFactor);
                visualizerModeTween = beforeVisualizerMode + (visualizerMode - beforeVisualizerMode) * animationFactor;
            }

            let checkerboardEnabled = Math.pow(Math.min(Math.max(0, 1 - Math.abs(2 * (visualizerModeTween - 1))), 1) - 1, 3) + 1;
            let sunnyDayEnabled = Math.pow(Math.min(Math.max(0, 1 - Math.abs(1.25 * (visualizerModeTween - 0.75))), 1) - 1, 3) + 1;
            let cityLightEnabled = Math.pow(Math.min(Math.max(0, 1 - Math.abs(.5 * (visualizerModeTween))), 1) - 1, 3) + 1;
            
            if (DrawingRunTime.foregroundColorPallete.length > 0){
                if (checkerboardEnabled != 0){
                    backgroundContext2D.save();
                    let effectiveWidth = Math.sqrt(2 * Math.pow(Math.max(maxWidth, maxHeight), 2));

                    backgroundContext2D.scale(1, 0.5)
                    backgroundContext2D.rotate(Math.PI / 4);
                    backgroundContext2D.translate(0, -effectiveWidth + 200 * (Date.now() / 1000 % 2));
                    for (let x = 0;x<effectiveWidth / 50;x++){
                        for (let y = 0;y<effectiveWidth / 50;y++){
                            let index = x + y;
                            let blacked = index % 2 == 1;

                            if (blacked){
                                backgroundContext2D.fillStyle = ColorMixer.newOpacity(DrawingRunTime.foregroundColor, .2 * checkerboardEnabled).toStyle();
                            }else{
                                backgroundContext2D.fillStyle = ColorMixer.newOpacity(DrawingRunTime.backgroundColor, .2 * checkerboardEnabled).toStyle();
                            }

                            backgroundContext2D.fillRect(x * 100, y * 100, 100, 100);
                        }
                    }
                    backgroundContext2D.restore();
                }
                if (sunnyDayEnabled != 0){
                    for (let i = 0;i<25;i++){
                        let randomRotation = 3 * Math.tan(i / 25 - 0.5) + 0.75 
                            + Math.sin(Date.now() / 2500) * Math.PI / 25 * (.5 + .75 * DrawingRunTime.bundleRandomness[i + 3]);
                        let maximumMagnitude = 2 * Math.sqrt(Math.pow(maxWidth, 2) + Math.pow(maxHeight, 2));
                        let toX = Math.cos(randomRotation) * maximumMagnitude;
                        let toY = Math.sin(randomRotation) * maximumMagnitude;

                        let randomColor = DrawingRunTime.foregroundColorPallete[Math.floor(DrawingRunTime.bundleRandomness[i + 2] * DrawingRunTime.foregroundColorPallete.length)];

                        backgroundContext2D.beginPath();
                        backgroundContext2D.moveTo(toX, toY);
                        backgroundContext2D.lineTo(-50 + (maxWidth / 2) * checkerboardEnabled, -50 - 125 * checkerboardEnabled);

                        backgroundContext2D.lineWidth = 100;
                        backgroundContext2D.shadowColor = randomColor.toStyle();
                        backgroundContext2D.strokeStyle = ColorMixer.newOpacity(randomColor,.4 * sunnyDayEnabled).toStyle();
                        backgroundContext2D.stroke();
                    }
                }
                if (cityLightEnabled != 0 ){
                    let timeFactor = Math.min(1, (Date.now() - TimingState.timeSinceTrackChange) / 1000);
                    let animationFactor = 1 - AnimationTween.bounce(AnimationTween.exponential(timeFactor));
     
                    let dftContent = DrawingRunTime.renderObjects.DFTContent;
    
                    let timeFactor3 = Math.min(1, (Date.now() - dftContent.timeSinceAudioSample) / 75);
                    let animationFactor3 = AnimationTween.simpleExponential(timeFactor3);
                    
                    for (let i = 0;i<75;i++){
                        let circleX = DrawingRunTime.bundleRandomness[i] * maxWidth - 200;
                        let circleY = DrawingRunTime.bundleRandomness[i + 1] * maxHeight + 500;
                        let transitionInitialFactor = DrawingRunTime.bundleRandomness[i + 3];
                        let speedFactor = DrawingRunTime.bundleRandomness[i + 4];
    
                        let totalLoudness = 0;
    
                        let scaledSamples = (i + 1) / (76) * DrawingRunTime.renderObjects.DFTContent.currentAudioSample.length
    
    
                        for (let r = 0;r<scaledSamples;r++){
                            let currentLoudness = DrawingRunTime.renderObjects.DFTContent.currentAudioSample[r];
                            let previousLoudness = DrawingRunTime.renderObjects.DFTContent.previousAudioSample[r];
                            let loudness = previousLoudness + (currentLoudness - previousLoudness) * animationFactor3;
                            totalLoudness += loudness;
                            accumulativeValues[i] = (accumulativeValues[i] + Math.pow(loudness, 5) * 125);
    
                            if (Number.isNaN(accumulativeValues[i]) || accumulativeValues[i] > 7000 + 10000 * speedFactor){
                                accumulativeValues[i] = 0;
                            }
                        }
    
                        totalLoudness /= (scaledSamples);
        
                        let randomColor = DrawingRunTime.foregroundColorPallete[Math.floor(DrawingRunTime.bundleRandomness[i + 2] * DrawingRunTime.foregroundColorPallete.length)];
        
                        let timeFactor = ((Date.now() + accumulativeValues[i]) / (7000 + 10000 * speedFactor) + transitionInitialFactor) % 1;
                        let animationFactor2 = AnimationTween.bounce(timeFactor);
        
                        circleX += timeFactor * 300;
                        circleY -= timeFactor * 600;
        
                        let gradient = backgroundContext2D.createRadialGradient(circleX, circleY, 0, circleX, circleY, 50 + timeFactor * 200 + 40* totalLoudness);
                        gradient.addColorStop(0, ColorMixer.newOpacity(randomColor, .4 * animationFactor * animationFactor2 * cityLightEnabled).toStyle());
                        gradient.addColorStop(1, ColorMixer.newOpacity(randomColor, 0).toStyle());
                        
                        backgroundContext2D.fillStyle = gradient;
                        backgroundContext2D.fillRect(circleX - 300 - 40 * totalLoudness, circleY - 300 - 40 * totalLoudness, 600 + 80 * totalLoudness, 600 + 80 * totalLoudness);
                    }
                }
            }
    
        }, 1000 / 60);

        window.addEventListener("orientationchange", ()=>{
            renderedBackground = false;
            DrawingRunTime.updateWindowSize();
        })

        window.addEventListener("resize", ()=>{
            renderedBackground = false;
            DrawingRunTime.updateWindowSize();
        });
    };
};

class BackgroundTasks{
    static currentSpotifyState: SpotifyState;
    static currentJadeLyrics: JadeLyrics | null;
    static jadeLyricsSupported: boolean;

    static averageDelayExperience = 0;

    static currentDFTResults: number[] = [];

    static renderedJadeLyricsBar: {
        start: number,
        end: number
    }[] = [];

    static init(){
        const transmission = new Transmission(undefined, undefined);

        let timeSinceProcessingUpdate = 0;
        let userActedTrackSwitch = false;
        let onNewSpotifyState = async (_: any, data: SpotifyState)=>{
            let controller = transmission.controller!;
            if (!BackgroundTasks.currentSpotifyState){
                BackgroundTasks.currentSpotifyState = {} as SpotifyState;
            }

            data.timeFeteched += BackgroundTasks.averageDelayExperience;

            if (BackgroundTasks.currentSpotifyState.artworkURL != data.artworkURL || data.albumName != BackgroundTasks.currentSpotifyState.albumName){
                await new Promise<void>((accept)=>{
                    controller.sendMessage({
                        messageType: "ObtainSpotifyImage",
                        replyType: "feedback",
                        callback(response, imageData: string){
                            let base64Representation = `data:image/jpeg;base64,${imageData}`;
                            let newImage = new Image();
                            newImage.src = base64Representation;

                            newImage.onload = ()=>{
                                let results = DynamicPrimaryColorEngine.processImageUsingAlgorithm(newImage, newImage.width, newImage.height);


                                DrawingRunTime.previousForegroundColor = DrawingRunTime.foregroundColor;
                                DrawingRunTime.previousBackgroundColor = DrawingRunTime.backgroundColor;

                                {
                                    DrawingRunTime.backgroundColor = results.backgroundColor[0].color;
                                    let feasibilityFactor = 0;
                                    for (let color of results.backgroundColor){
                                        let newFeasibilityFactor = Math.pow(color.counts, 4) *
                                            Math.pow(DynamicPrimaryColorEngine.measureVibrance(color.color), 1) * // 2 before here... for nice good vibrancy in colors
                                            Math.pow(color.fitness, .5) / 
                                            Math.pow(DynamicPrimaryColorEngine.measureBrightness(color.color), .5);
                                        if (newFeasibilityFactor > feasibilityFactor){
                                            DrawingRunTime.backgroundColor = color.color;
                                            feasibilityFactor = newFeasibilityFactor;
                                        }
                                    }
                                }
                                {
                                    DrawingRunTime.foregroundColor = results.foregroundColor[0].color;
                                    let feasibilityFactor = 0;
                                    for (let color of results.foregroundColor){
                                        // let newFeasibilityFactor = 
                                        //     Math.pow(color.fitness, 6) *
                                        //     Math.pow(Math.sqrt(color.counts), 5) *
                                        //     Math.pow(DynamicPrimaryColorEngine.measureBrightness(color.color), 0) *
                                        //     Math.pow(DynamicPrimaryColorEngine.measureVibrance(color.color), 0) / 
                                        //     Math.pow(DynamicPrimaryColorEngine.measureRelvance(color.color, DrawingRunTime.backgroundColor), 14);
                                        let newFeasibilityFactor = 
                                            Math.pow(color.fitness, 2) *
                                            Math.pow(Math.sqrt(color.counts), .05) *
                                            Math.pow(DynamicPrimaryColorEngine.measureBrightness(color.color), 0) *
                                            Math.pow(DynamicPrimaryColorEngine.measureVibrance(color.color), 0) / 
                                            Math.pow(DynamicPrimaryColorEngine.measureRelvance(color.color, DrawingRunTime.backgroundColor), 15);
                                        if (newFeasibilityFactor > feasibilityFactor){
                                            feasibilityFactor = newFeasibilityFactor;
                                            DrawingRunTime.foregroundColor = color.color;
                                        }
                                    }

                                    if (DynamicPrimaryColorEngine.measureColorOpposition(DrawingRunTime.foregroundColor, DrawingRunTime.backgroundColor) > 0.75){
                                        DrawingRunTime.foregroundColor = ColorMixer.darken(DrawingRunTime.foregroundColor);
                                    }
                                    if (DynamicPrimaryColorEngine.measureRelvance(DrawingRunTime.foregroundColor, DrawingRunTime.backgroundColor) > 0.5)
                                        for (let i = 0;i<10;i++)
                                            if (DynamicPrimaryColorEngine.measureRelvance(DrawingRunTime.foregroundColor, DrawingRunTime.backgroundColor) > 0.5){
                                                DrawingRunTime.foregroundColor = ColorMixer.darken(DrawingRunTime.foregroundColor);
                                            }

                                    let correctionAttempt = 0;
                                    while (DynamicPrimaryColorEngine.measureBrightness(DrawingRunTime.foregroundColor) > 0.5 && DynamicPrimaryColorEngine.measureBrightness(DrawingRunTime.backgroundColor) > 0.6){
                                        DrawingRunTime.foregroundColor = ColorMixer.darken(DrawingRunTime.foregroundColor);
                                        correctionAttempt += 1;
                                        if (correctionAttempt > 10)
                                            break;
                                    }
                                    // while (DynamicPrimaryColorEngine.measureBrightness(DrawingRunTime.foregroundColor) < 0.4 && DynamicPrimaryColorEngine.measureBrightness(DrawingRunTime.backgroundColor) > 0.2){
                                    //     DrawingRunTime.foregroundColor = ColorMixer.brighten(DrawingRunTime.foregroundColor);
                                    //     correctionAttempt += 1;
                                    //     if (correctionAttempt > 10)
                                    //         break;
                                    // }

                                    if ((DynamicPrimaryColorEngine.measureGreyLevel(DrawingRunTime.foregroundColor) > 0.9 && 
                                        DynamicPrimaryColorEngine.measureGreyLevel(DrawingRunTime.backgroundColor) > 0.9) &&
                                        (DynamicPrimaryColorEngine.measureBrightness(DrawingRunTime.foregroundColor) < 0.25 && 
                                        DynamicPrimaryColorEngine.measureBrightness(DrawingRunTime.backgroundColor) < 0.25)){
                                        for (let color of results.foregroundColor){
                                            // let newFeasibilityFactor = 
                                            //     Math.pow(color.fitness, 6) *
                                            //     Math.pow(Math.sqrt(color.counts), 5) *
                                            //     Math.pow(DynamicPrimaryColorEngine.measureBrightness(color.color), 0) *
                                            //     Math.pow(DynamicPrimaryColorEngine.measureVibrance(color.color), 0) / 
                                            //     Math.pow(DynamicPrimaryColorEngine.measureRelvance(color.color, DrawingRunTime.backgroundColor), 14);
                                            let newFeasibilityFactor = 
                                                Math.pow(color.fitness, 1.5) *
                                                Math.pow(Math.sqrt(color.counts), .05) *
                                                Math.pow(DynamicPrimaryColorEngine.measureBrightness(color.color), 0) *
                                                Math.pow(DynamicPrimaryColorEngine.measureVibrance(color.color), 1) / 
                                                Math.pow(DynamicPrimaryColorEngine.measureRelvance(color.color, DrawingRunTime.backgroundColor), 15);
                                            if (newFeasibilityFactor > feasibilityFactor){
                                                feasibilityFactor = newFeasibilityFactor;
                                                DrawingRunTime.foregroundColor = color.color;
                                            }
                                        }
                                    }
                                }
                                
                                DrawingRunTime.foregroundColorPallete = (()=>{
                                    let colors: Color[] = [];

                                    let i = 0;
                                    for (let cc of results.foregroundColor){
                                        if (i > 5)
                                            break;
                                        i ++;
                                        colors.push(cc.color);
                                    }
                                    for (let cc of results.backgroundColor){
                                        if (i > 8)
                                            break;
                                        i ++;
                                        colors.push(cc.color);
                                    }
                                    // for (let cc of results.backgroundColor){
                                    //     colors.push(cc.color);
                                    // }

                                    return colors;
                                })();

                                let tempContext2d = Images.imageOverler.getContext("2d")!;
                                
                                tempContext2d.fillStyle = DrawingRunTime.backgroundColor.toStyle();
                                tempContext2d.fillRect(0, 0, 640, 640);
                                if (DynamicPrimaryColorEngine.measureBrightness(DrawingRunTime.backgroundColor) < 0.6){
                                    tempContext2d.globalCompositeOperation = "source-in";
                                    tempContext2d.globalAlpha = 0.75;
                                    tempContext2d.drawImage(ObtainableImage.attemptToGetImage(Images.overlay), 0, 0);
                                    tempContext2d.globalAlpha = 1;
                                    tempContext2d.globalCompositeOperation = "multiply";
                                }
                                tempContext2d.drawImage(newImage, 0, 0, 640, 640);
                                tempContext2d.globalCompositeOperation = "source-over";

                                let processedImage = Images.imageOverler.transferToImageBitmap();

                                if (DrawingRunTime.renderObjects.AlbumCover.previousImage){
                                    DrawingRunTime.renderObjects.AlbumCover.previousImage.close();
                                }
                                if (DrawingRunTime.renderObjects.AlbumCover.blurredImage){
                                    DrawingRunTime.renderObjects.AlbumCover.blurredImage.close();
                                }

                                DrawingRunTime.renderObjects.AlbumCover.previousImage = DrawingRunTime.renderObjects.AlbumCover.image;
                                DrawingRunTime.renderObjects.AlbumCover.image = processedImage;
                                accept();
                                timeSinceProcessingUpdate = 0;
                            };

                        }
                    }, data.artworkURL, data.albumName, data.spotifyID);
                });
            }else{
                timeSinceProcessingUpdate = 0;
                if (BackgroundTasks.currentSpotifyState.spotifyID != data.spotifyID){
                    if (DrawingRunTime.renderObjects.AlbumCover.previousImage != DrawingRunTime.renderObjects.AlbumCover.image){
                        if (DrawingRunTime.renderObjects.AlbumCover.previousImage){
                            DrawingRunTime.renderObjects.AlbumCover.previousImage.close();
                        }

                        DrawingRunTime.renderObjects.AlbumCover.previousImage = DrawingRunTime.renderObjects.AlbumCover.image;
                        DrawingRunTime.previousForegroundColor = DrawingRunTime.foregroundColor;
                        DrawingRunTime.previousBackgroundColor = DrawingRunTime.backgroundColor;
                    }
                }
            }
            
            if (BackgroundTasks.currentSpotifyState.spotifyID != data.spotifyID){
                if (userActedTrackSwitch){
                    userActedTrackSwitch = false;
                    DrawingRunTime.timeSinceTrackSwitchAction = Date.now();
                }
                TimingState.timeSinceTrackChange = Date.now();
                if (BackgroundTasks.jadeLyricsSupported != false){
                    TimingState.timeSinceJadeLyricsLoaded = Date.now();
                    BackgroundTasks.jadeLyricsSupported = false;
                }

                controller.sendMessage({
                    messageType: "ObtainJadeLyrics",
                    replyType: "feedback",
                    callback(response, jadeLyrics: JadeLyrics | null){
                        if (BackgroundTasks.currentSpotifyState.spotifyID != data.spotifyID)
                            return;
    
                        if (DrawingRunTime.showingSubline){
                            DrawingRunTime.timeSinceSublineChange = Date.now();
                            DrawingRunTime.showingSubline = false;
                        }
    
                        if (jadeLyrics){
                            if (jadeLyrics.timeLength > BackgroundTasks.currentSpotifyState.timeLength + 5){
                                jadeLyrics = null;
                            }
                        }
    
                        let hasJadeLyrics = jadeLyrics != null;
                        
                        if (BackgroundTasks.jadeLyricsSupported != hasJadeLyrics){
                            TimingState.timeSinceJadeLyricsLoaded = Date.now();
                            BackgroundTasks.jadeLyricsSupported = hasJadeLyrics;
                        }
                        BackgroundTasks.currentJadeLyrics = jadeLyrics;
                        
                        if (jadeLyrics){
                            BackgroundTasks.renderedJadeLyricsBar = [];
    
                            let currentState: {
                                start: number,
                                end: number
                            } = {
                                start: 0,
                                end: 0
                            };
                            let disapparenceThresholdTime = 0;
                            for (let line of jadeLyrics.lyricalLines){
                                if (disapparenceThresholdTime != line.disapparenceThresholdTime){
                                    let lineStartTime = line.lyricalInstructions[0].time;
                                    let lineEndTime = line.lyricalInstructions[line.lyricalInstructions.length - 1].time;
                                    disapparenceThresholdTime = line.disapparenceThresholdTime;
                                    currentState = {
                                        start: lineStartTime,
                                        end: lineEndTime + 4,
                                    }
                                    BackgroundTasks.renderedJadeLyricsBar.push(currentState);
                                }else{
                                    let lineEndTime = line.lyricalInstructions[line.lyricalInstructions.length - 1].time;
                                    currentState.end = lineEndTime;
                                }
                            }
                        }
                    },
                }, data.trackName, data.albumName, data.artistName, data.spotifyID);
            }
            if (DrawingRunTime.renderObjects.ControlBar.playing != data.playState){
                DrawingRunTime.renderObjects.ControlBar.playing = data.playState;
                DrawingRunTime.renderObjects.ControlBar.timeSinceStateChange = Date.now();
            }

            BackgroundTasks.currentSpotifyState = data;
        }

        transmission.on("transmit", ()=>{
            let controller = transmission.controller!;
            {
            //     let currentLoudness: number[] = (()=>{let a = [];for (let i = 0;i<100;i++)a.push(0);return a})();
            //     let dampendedLoudness: number[] = (()=>{let a = [];for (let i = 0;i<100;i++)a.push(0);return a})();
            //     let dampendedSingleLoudness: number = 0;
    
            //     let timeSinceUpdate = Date.now();
            //     let addedInterval = 0;
            //     let audioListenerInterval = setInterval(() => {
            //         let interval = Date.now() - timeSinceUpdate;
            //         timeSinceUpdate = Date.now();
            //         addedInterval += interval;
            //         let requiredInterval = Math.floor(addedInterval / 4) * 4;

            //         addedInterval -= requiredInterval;

            //         for (let i = 0;i<requiredInterval/4;i++){
            //             let singleLoudnessValue = 0;
            //             for (let i = 0;i<100;i++){
            //                 singleLoudnessValue += currentLoudness[i];
            //             }
            //             dampendedSingleLoudness = dampendedSingleLoudness + (singleLoudnessValue/100 - dampendedSingleLoudness)*(Math.pow(singleLoudnessValue/100, 4)+.25)/1.25;
            //             for (let i = 0;i<100;i++){
            //                 dampendedLoudness[i] = dampendedLoudness[i] + (currentLoudness[i]  - dampendedLoudness[i]) / 14;
            //             }
            //         }

            //         BackgroundTasks.currentDFTResults = dampendedLoudness;
                    
            //     }, 4);

                controller.listenMessage("DFTResults", (response, data: Buffer_JADEPORTED)=>{
                    // console.log(data.readUInt8(0));

                    // currentLoudness = [];
                    for (let i = 0;i<data.length;i++){
                        let number = data.readUInt8(i);
                        DrawingRunTime.renderObjects.DFTContent.rawAudioSample[i] = (DrawingRunTime.renderObjects.DFTContent.rawAudioSample[i] || 0) + (Number.isNaN(number) ? 0 : number / 255); 
                        // currentLoudness[i] = Number.isNaN(number) ? 0 : number / 255; 
                    }
                    DrawingRunTime.renderObjects.DFTContent.samples += 1;
                });
            }


            let updateSpotifyState = ()=>{
                controller.sendMessage({
                    messageType: "GetCurrentSpotifyState",
                    replyType: "feedback",
                    callback: onNewSpotifyState
                })
            };
            let spotifyStateRetriever = setInterval(updateSpotifyState, 1000);
            updateSpotifyState();

            transmission.once("close", ()=>{
                clearInterval(spotifyStateRetriever);
            });

            (async() =>{
                let sampledTimes: [number, number][] = []
                for (let i = 0;i<10;i++){
                    controller.sendMessage({
                        messageType: "GetTime",
                        replyType: "feedback",
                        callback: (response, time)=>{
                            sampledTimes.push([time, Date.now()]);
                        }
                    })
                    await new Promise<void>((accept)=>setTimeout(accept, 200));
                }
                await new Promise<void>((accept)=>setTimeout(accept, 1000));

                let averageServerTime = 0;
                let averageClientTime = 0;

                for (let i = 0;i<10;i++){
                    averageServerTime += sampledTimes[i][0];
                    averageClientTime += sampledTimes[i][1];
                }

                averageServerTime /= 10;
                averageClientTime /= 10;

                BackgroundTasks.averageDelayExperience = averageClientTime - averageServerTime;


            })();
        });

        transmission.autoReconnect = true;
        transmission.delayToAutoReconnect = 1000;
        
        transmission.transmit();
        function commitAction(action: "TogglePlayState" | "PreviousTrack" | "SkipTrack"){
            let transmissionController = transmission.controller;
            if (!transmissionController)
                return;
            DrawingRunTime.timeSinceCurrentAction = Date.now();
            switch(action){
                case "TogglePlayState":{
                    BackgroundTasks.currentSpotifyState.playState = !BackgroundTasks.currentSpotifyState.playState;
                    if (BackgroundTasks.currentSpotifyState.playState){
                        DrawingRunTime.currentAction = "Play";
                    }else{
                        DrawingRunTime.currentAction = "Pause";
                    }
                    transmissionController.sendMessage({
                        replyType: "feedback",
                        messageType: "TogglePlaybackState",
                        callback: onNewSpotifyState
                    })
                    break;
                }
                case "PreviousTrack":{
                    DrawingRunTime.currentAction = "Previous Track";
                    transmissionController.sendMessage({
                        replyType: "feedback",
                        messageType: "PreviousTrack",
                        callback: onNewSpotifyState
                    });
                    DrawingRunTime.trackSwitchAction = "left";
                    userActedTrackSwitch = true;
                    break;
                }
                case "SkipTrack":{
                    DrawingRunTime.currentAction = "Skip Track";
                    transmissionController.sendMessage({
                        replyType: "feedback",
                        messageType: "NextTrack",
                        callback: onNewSpotifyState
                    });
                    DrawingRunTime.trackSwitchAction = "right";
                    userActedTrackSwitch = true;
                    break;
                }
            }
        }
        let debounceKey = false;
        window.addEventListener("keyup", ()=>{
            debounceKey = false;
        })

        window.addEventListener("keydown", (event)=>{
            if (debounceKey)
                return;

            debounceKey = true;


            let keyCode = event.code;

            switch(keyCode){
                case "Space":{
                    commitAction("TogglePlayState");
                    break;
                }
                case "ArrowLeft":{
                    commitAction("PreviousTrack");
                    break;
                }
                case "ArrowRight":{
                    commitAction("SkipTrack");
                    break;
                }
            }
        });

        let cBP = DrawingRunTime.renderObjects.ControlBar;
        let timeSinceCommandSeek = 0;

        let mouseInterval: NodeJS.Timeout;

        canvas.addEventListener("mousedown", (event)=>{
            if (event.x > cBP.x && event.x < cBP.x + cBP.width &&
                event.y > cBP.y && event.y < cBP.y + cBP.height){
                

                cBP.timePositionDragElement.raw.active = true;
                cBP.timePositionDragElement.raw.x = event.x;
                cBP.timePositionDragElement.raw.y = event.y;
                timeSinceCommandSeek = 0;


                mouseInterval = setInterval(()=>{
                    let tPDE = cBP.timePositionDragElement;

                    if (Date.now() - cBP.timePositionDragElement.timeSinceActive > 200){
                        let timePosition = Math.min(1, Math.max(0, (cBP.timePositionDragElement.raw.x - cBP.x) / cBP.width)) * BackgroundTasks.currentSpotifyState.timeLength;
                        if (Math.abs(timePosition - BackgroundTasks.currentSpotifyState.timePosition) > 1 &&
                            (Date.now() - timeSinceCommandSeek) > 500){
                            timeSinceCommandSeek = Date.now();
                            transmission.controller!.sendMessage({
                                messageType: "SeekTrack",
                                replyType: "feedback",
                                callback: onNewSpotifyState
                            }, timePosition);
                        }
                    }
                }, 250);
            }
        });

            
        canvas.addEventListener("mousemove", (event)=>{
            if (cBP.timePositionDragElement.raw.active){

                cBP.timePositionDragElement.raw.x = event.x;
                cBP.timePositionDragElement.raw.y = event.y;

            }
        });
        canvas.addEventListener("mouseup", (event)=>{
            if (cBP.timePositionDragElement.raw.active){
                clearInterval(mouseInterval);
                cBP.timePositionDragElement.raw.active = false;

                cBP.timePositionDragElement.raw.x = event.x;
                cBP.timePositionDragElement.raw.y = event.y;
            }
        });
    }; 
}

DrawingRunTime.init();
BackgroundTasks.init();

ObtainableImage.attemptToGetImage(Images.overlay);