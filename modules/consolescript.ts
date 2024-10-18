

/**
 * JadesTS-JS MODULES >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
 * -----------------------------------------------------
 * CONSOLESCRIPT.TS
 * -----------------------------------------------------
 * 
 * Author: Joshua Null (TheJades)
 * 
 * what is it about
 * 
 *  ⚬ beautifully display warnings and outputs
 * 
 * 
 * heve fun
 */
/**
 * 
*/

let currentDebugLevel = 0;

export function enableDebugs(){
    currentDebugLevel = 1;
}

export const isWebBrowser = (()=>{
    try{
        let a = process;
        return false;
    }
    catch(err){
        return true;
    }
})();

let util: typeof import("util") | null = null;
let FileSystem: typeof import("fs") | null = null;

if (isWebBrowser == false){
    import("fs").then(va=>{
        FileSystem = va;
    })
    import("util").then(va=>{
        util = va;
    })
}


export function setDebugLevel(level: "disabled" | "enabled" | "detailed"){
    switch(level){
        case "disabled":{
            currentDebugLevel = 0;
            break;   
        }
        case "enabled":{
            currentDebugLevel = 1;
            break;
        }
        case "detailed":{
            currentDebugLevel = 2;
            break;
        }
        default:{
            warn("Unknown Debug Level");
            break;
        }
    }
}

import { Color, ColorMixer, Formatter } from "./art.js";

let mainConsole = console;
let timeSinceInitialization = Date.now();

let debugLogs: string[] = [];

function printToConsole(content: string, onlyLog = true){
    if (onlyLog){
        mainConsole.log(content);
    }
    debugLogs.push(content);
    if (debugLogs.length >= 40000){
        debugLogs.splice(0, 10);
    }
}


function getScriptNameTrace(specificStack?: string){
    let currentTrace = (specificStack || new Error().stack || "").split(/\n/);
    let scriptsTrace: string[] = [];

    currentTrace.shift();

    for (let traceitem of currentTrace){
        let traceScriptLikeResults = (traceitem.match(/\/([^\/]*):(\d+):\d+/) || ["", "", ""]);
        scriptsTrace.push(`${traceScriptLikeResults[1]}:${traceScriptLikeResults[2]}`);
    }
    
    return scriptsTrace;
}

function toNearTimeFormat(seconds: number){
    function toTwoDigits(value: number){
        return value < 10 ? `0${value}` : String(value);
    };

    return `${toTwoDigits(Math.floor(seconds/3600))}:${toTwoDigits(Math.floor(seconds/60)%60)}:${toTwoDigits(Math.floor(seconds%60))}`;
}

function formatOutput(currentTime: number, callerScript: string, printMode: "output" | "warn" | "stack" | "error" | "debug", item: any, format = true){
    let color: Color;
    let printSymbol = "";

    switch(printMode){
        case "error":{
            color = new Color(255, 0, 85);
            printSymbol = "X";
            break;
        }
        case "output":{
            color = new Color(0, 255, 85);
            printSymbol = "✔";
            break;
        }
        case "stack":{
            color = new Color(0, 170, 255);
            printSymbol = "↪";
            break;
        }
        case "warn":{
            color = new Color(255, 127, 0);
            printSymbol = "⚠";
            break;
        }
        case "debug":{
            color = new Color(255, 48, 177);
            printSymbol = "ᨕ";
            break;
        }
    }

    let head = `${color.toANSIBackground()}\x1B[38;2;10;10;29m[${toNearTimeFormat(currentTime)}][${printSymbol}][${callerScript.toUpperCase()}]:\x1B[0m${color.toANSIForeground()} `;

    let stringItem = format ? paintAndInspectOutput(item, color) : item;

    let stringSeperatedItem = stringItem.split(/\n/);

    let defaultColor = ColorMixer.screen(color, new Color(150, 150, 150));

    for (let i = 1;i<stringSeperatedItem.length;i++){
        let lineNumber = `${i + 1}`;

        stringSeperatedItem[i] = `${color.toANSIForeground()}${" ".repeat(toNearTimeFormat(currentTime).length + callerScript.length + 6 - lineNumber.length)}${lineNumber} |${defaultColor.toANSIForeground()} ${stringSeperatedItem[i]}`;
    }

    stringItem = stringSeperatedItem.join("\n");
    
    return `${head}${stringItem}\x1B[0m`;
}

function paintAndInspectOutput(output: string, color: Color){
    let toStringItem = `\x1B[39m${typeof output == "string" ? output : util?.inspect(output, true, 4, true)}`;
    
    let colorsToReplace: [string, Color][] = [
        ["\x1B\\[33m", new Color(229, 229, 14)],
        ["\x1B\\[32m", new Color(15, 188, 122)],
        ["\x1B\\[36m", new Color(15, 164, 201)],
        ["\x1B\\[39m", new Color(150, 150, 150)]
    ];

    for (let colorReplacer of colorsToReplace){
        toStringItem = toStringItem.replace(new RegExp(colorReplacer[0], "g"), ColorMixer.screen(color, colorReplacer[1]).toANSIForeground());
    }

    return toStringItem;
}

export function log(... args: any[]){
    if (isWebBrowser){
        return console.log(...args);
    }

    let callerScript = getScriptNameTrace()[2];

    let currentTime = (Date.now() - timeSinceInitialization) / 1000;

    for (let item of args){
        printToConsole(formatOutput(currentTime, callerScript, "output", item));;
    }
}

export function warn(... args: any[]){
    if (isWebBrowser){
        return console.warn(...args);
    }


    let callerScript = getScriptNameTrace()[2];

    let currentTime = (Date.now() - timeSinceInitialization) / 1000;

    for (let item of args){
        printToConsole(formatOutput(currentTime, callerScript, "warn", item));
    }
}

export function error(... args: any[]){
    if (isWebBrowser){
        return console.error(...args);
    }

    let callerScript = getScriptNameTrace()[2];

    let currentTime = (Date.now() - timeSinceInitialization) / 1000;

    for (let item of args){
        printToConsole(formatOutput(currentTime, callerScript, "error", item));
    }
}

export function debugDetailed(...args: any[]){
    if (isWebBrowser){
        return;
    }
    if (currentDebugLevel >= 2){
        let callerScript = getScriptNameTrace()[2];
    
        let currentTime = (Date.now() - timeSinceInitialization) / 1000;
    
        for (let item of args)
            printToConsole(formatOutput(currentTime, callerScript, "debug", item), currentDebugLevel >= 2); 
    }
}
export function debug(...args: any[]){
    if (isWebBrowser){
        return;
    }

    let callerScript = getScriptNameTrace()[2];

    let currentTime = (Date.now() - timeSinceInitialization) / 1000;

    for (let item of args)
        printToConsole(formatOutput(currentTime, callerScript, "debug", item), currentDebugLevel >= 1); 
}

let times = new Map<string, number>();

let performanceMeasurer = isWebBrowser ? ()=>{
    return window.performance.now() * 1000
} : ()=>{
    let a = process.hrtime();
    return a[0] * 1000000 + a[1] / 1000;
};

export function time(name: string){
    if (isWebBrowser){
        return console.time(name);
    }

    if (currentDebugLevel >= 1){
        let callerScript = getScriptNameTrace()[2];
    
        let currentTime = (Date.now() - timeSinceInitialization) / 1000;

        printToConsole(formatOutput(currentTime, callerScript, "debug", `Started Timer for ${name}.`)); 
    }
    
    times.set(name, performanceMeasurer());

}

export function timeEnd(name: string){
    if (isWebBrowser){
        return console.timeEnd(name);
    }
    
    let newTime = performanceMeasurer();
    let oldTime = times.get(name)!;
    let delta = newTime - oldTime;
    times.delete(name);

    if (currentDebugLevel >= 1){
        let callerScript = getScriptNameTrace()[2];
    
        let currentTime = (Date.now() - timeSinceInitialization);

        if (delta < 1000){
            printToConsole(formatOutput(currentTime, callerScript, "debug", `Ended Timer for ${name}. Delta: ${delta} microseconds`)); 
        }else{
            if (delta < 1000000){
                printToConsole(formatOutput(currentTime, callerScript, "debug", `Ended Timer for ${name}. Delta: ${delta / 1000} millaseconds`)); 
            }else{
                printToConsole(formatOutput(currentTime, callerScript, "debug", `Ended Timer for ${name}. Delta: ${delta / 1000000} seconds`)); 
            }
        }

    }
    
}


export function createPromiseTracker(func: (accept: (...any: any)=>(any), reject: (err: any)=>(void))=>(void)){
    return new Promise<any>((accept, reject)=>{
        func(accept, (err: any)=>{
            let stacks = new Error().stack;
            // error(`Promise Tracked Error: ${err}`);
            // stack(`Stack Trace ${stacks}`);
            reject(err);
        });
    });
}

export function getScriptEnvironment(){
    try{
        let a = window;
        return "browser"
    }
    catch(err){
        return "nodejs";
    }
}

let bindedExitFunction: (()=>(void))[] = [];

export function bindToExit(func: ()=>(void)){
    bindedExitFunction.push(func);
}

if (isWebBrowser == false){
    process.stdin.resume();

    function reportExitCode(exitCode: number, selfExit: boolean = false){
        let currentTime = (Date.now() - timeSinceInitialization) / 1000;

        if (exitCode >= 128){
            printToConsole(formatOutput(currentTime, "SYSTEM", "warn", `Interrupt Exit: ${exitCode}`, false));
        }else{
            if (exitCode == 0){
                printToConsole(formatOutput(currentTime, "SYSTEM", "output", `Good Exit: ${exitCode}`, false));
            }else{
                printToConsole(formatOutput(currentTime, "SYSTEM", "error", `Bad Exit: ${exitCode}`, false));
            }
        }

        if (selfExit){
            process.exit(exitCode);
        }
    }

    let alreadyExiting = false;

    function onExit(){
        if (alreadyExiting)
            return;

        let currentTime = (Date.now() - timeSinceInitialization) / 1000;

        try{FileSystem!.mkdirSync("./logs/")}catch(er){};
        let cD = new Date();
        FileSystem!.writeFileSync(`./logs/${cD.getMonth()}-${cD.getDate()}-${cD.getFullYear()} ${cD.toLocaleTimeString()}.txt`, debugLogs.join("\n"));
        printToConsole(formatOutput(currentTime, "SYSTEM", "output", `Sucessfully dumped system's debug logs into ${cD.getMonth()}-${cD.getDate()}-${cD.getFullYear()} ${cD.toLocaleTimeString()}.txt`, false));

        alreadyExiting = true;
        printToConsole(formatOutput(currentTime, "SYSTEM", "output", "System is going into exit... Cleaning up...", false));
        for (let func of bindedExitFunction)
            func();
        printToConsole(formatOutput(currentTime, "SYSTEM", "output", "Finished Cleaning Up. Exiting Cleanly...", false));
    }

    process.on("uncaughtException", (event)=>{
    
        let callerScript = getScriptNameTrace(event.stack)[0] || "";
    
        let currentTime = (Date.now() - timeSinceInitialization) / 1000;
    
        printToConsole(formatOutput(currentTime, callerScript, "error", `Uncaught Exception of Type "${event.name}": ${event.message}`, false));
        printToConsole(formatOutput(currentTime, callerScript, "stack", event.stack, false));
    });
    
    process.on("unhandledRejection", (rejection)=>{
        let currentTime = (Date.now() - timeSinceInitialization) / 1000;
    
        printToConsole(formatOutput(currentTime, "UNKNOWN", "error", `Unhandled Promise Rejection: ${rejection}`, false));
    });
    
    process.on("beforeExit", (exitCode)=>{
        onExit();
        reportExitCode(exitCode);
    });
    
    for (let i = 2;i<process.argv.length;i++){
        let arg = process.argv[i];
    
        let match = arg.match(/--debugLevel=([^ ]+)/);
    
        if (match){
            setDebugLevel(match[1] as any);
        }
    }
    process.on("SIGINT", ()=>{
        onExit();
        reportExitCode(130, true);
    });
    
    process.on("SIGUSR1", ()=>{
        onExit();
        reportExitCode(158, true);
    });
    process.on("SIGUSR2", ()=>{
        onExit();
        reportExitCode(159, true);
    });
}