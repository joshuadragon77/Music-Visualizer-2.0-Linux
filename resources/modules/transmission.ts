/**
 * JadesTS-JS MODULES >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
 * -----------------------------------------------------
 * TRANSMISSION.TS (REV.2)
 * -----------------------------------------------------
 * 
 * Author: Joshua Null (TheJades)
 * 
 * what is it about
 * 
 *  ⚬ features classes that allows the encoding and decoding jadestruct data types.
 *  ⚬ has my own written specification for Buffer that uses ArrayBuffers and other methods that web browsers use.
 * 
 * heve fun
 */
/**
 * 
*/

import * as console from "./consolescript.js";
import { Buffer_JADEPORTED, JadeStruct } from "./jadestruct.js";


export class EventEmitter<EventMapping>{

    eventListeners = new Map<keyof EventMapping, ((...args: EventMapping[keyof EventMapping][])=>(void))[]>();
    endedListeners = new Map<keyof EventMapping, EventMapping[keyof EventMapping][]>();

    constructor(events?: (keyof EventMapping)[]){
        if (events){
            for (let event of events){
                this.eventListeners.set(event, []);
            }
        }
    }

    protected fireEvent<EventName extends keyof EventMapping>(eventName: EventName, ...args: EventMapping[EventName][]){
        this.ensureEvent(eventName);
        for (let eventListener of this.eventListeners.get(eventName)!){
            eventListener(...args);
        }
    }

    protected endEvent<EventName extends keyof EventMapping>(eventName: EventName, ...args: EventMapping[EventName][]){
        if (this.endedListeners.has(eventName)){
            return;
        }
        this.ensureEvent(eventName);
        this.endedListeners.set(eventName, args);
        for (let eventListener of this.eventListeners.get(eventName)!){
            eventListener(...args);
        }
    }

    private ensureEvent(event: keyof EventMapping){
        if (this.eventListeners.has(event) == false){
            this.eventListeners.set(event, []);
        }
    }

    public on<EventName extends keyof EventMapping>(eventName: EventName, eventListener: (...args: EventMapping[EventName][])=>(void)){
        this.ensureEvent(eventName);
        if (this.endedListeners.has(eventName)){
            eventListener(...this.endedListeners.get(eventName)! as any);
            return;
        }
        this.eventListeners.get(eventName)?.push(eventListener as any);
    }
    
    public once<EventName extends keyof EventMapping>(eventName: EventName, eventListener: (...args: EventMapping[EventName][])=>(void)){
        this.ensureEvent(eventName);
        if (this.endedListeners.has(eventName)){
            eventListener(...this.endedListeners.get(eventName)! as any);
            return;
        }
        this.eventListeners.get(eventName)!.push((...args)=>{
            this.off(eventName, eventListener);
            eventListener(...args as any);
        });
        
    }

    public addEventListener<EventName extends keyof EventMapping>(eventName: EventName, eventListener: (...args: EventMapping[EventName][])=>(void)){
        this.on(eventName, eventListener);
    }

    public off<EventName extends keyof EventMapping>(eventName: EventName, eventListener: (...args: EventMapping[EventName][])=>(void)){
        this.ensureEvent(eventName);
        let listOfEventListener = this.eventListeners.get(eventName);
        
        if (listOfEventListener){
            let foundIndex = listOfEventListener.findIndex(va=>va==eventListener);

            if (foundIndex != -1){
                listOfEventListener.splice(foundIndex, 1);
            }
        }
    }

    public removeEventListener<EventName extends keyof EventMapping>(eventName: EventName, eventListener: (...args: EventMapping[EventName][])=>(void)){
        this.off(eventName, eventListener);
    }
}


var loadedModules: {
    WebSocketServer: typeof import("ws").WebSocketServer;
    WebSocket: typeof import("ws").WebSocket;
    rootCertificates: typeof import("tls").rootCertificates;
    HTTP: typeof import("http"),
    HTTPs: typeof import("https"),
} | null = null;

export function attemptLoadModule(){
    return new Promise<void>(async (accept, reject)=>{
        if (isWebBrowser){
            return accept();
        }
        let importsWS = await import("ws");
        let importHTTP = await import("http");
        let tls = await import ("tls");
        let importHTTPs = await import("https");
        loadedModules = {
            WebSocket: importsWS.WebSocket,
            WebSocketServer: importsWS.WebSocketServer,
            HTTP: importHTTP,
            rootCertificates: tls.rootCertificates,
            HTTPs: importHTTPs,
        }
        accept();
    });
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

interface GenericTransmission{

    controller: TransmissionController | undefined;

    currentlyConnectedSocket: import("ws").WebSocket | undefined | WebSocket;

    listen(messageType: string, messageListener: (messageRequest: MessageRequest, ...data: any[])=>(void)): void;
    send(messageParameters: MessageParameters, ...messageContent: any[]): void;

    transmit(socket: import("ws").WebSocket, password?: string): void;

    cut(): void;
}

type TransmitTask = {
    beingSent?: any;
    messageID: number;
    ready?: boolean;
    content?: any;
    error?: string;
    hasRecieved?: boolean;
    timeSinceSent?: number;
}

type TransmitMessage = {
    beingSent?: any;
    messageType: string;
    messageID: number;
    messageContent: any[];
    replyType: ReplyType;
    callback?: (response: MessageResponse, ...args: any[])=>(void);
    messageTimeSinceSent: number;
    lastCheckInTimeSince: number;
    hasReceived: boolean;
    hasSent: boolean;
}

type ReplyType = "feedback" | "inform" | "careless";

type MessageResponse = {
    messageType: string;
    replyType: ReplyType;
    error: string;
}

type MessageParameters = {
    messageType: string;
    replyType: ReplyType;
    callback?: (response: MessageResponse, ...args: any[])=>(void);
}

type MessageRequest = {
    messageType: string;
    replyType: ReplyType;
    
    accept?: (...args: any[])=>(void);
    reject?: (error: string)=>(void);
}

type Data = {
    data: string,
    readPos: number,
    length: number,
    index: number;
    callback: ()=>(void)
}

class TransmissionLoadBalancer extends EventEmitter<{
    message: {data: string}
}>{
    
    websocket: WebSocket;
    
    outgoingDataQueue: Data[] = [];
    incomingDataQueue: string[] = [];

    avaliableIndexes = (()=>{
        let a = [];
        for (let i = 1;i<=128;i++){
            a.push(i);
        }
        return a;
    })();

    bandwidthLimitation: number = 10000;

    currentDataQueueIndex = 1;

    dataCycleInProgress = false;
    
    constructor(websocket: WebSocket){
        super();
        this.websocket = websocket;


        websocket.addEventListener("message", (messageEvent)=>{
            let data = messageEvent.data;

            if (data != "\0\0\0\0"){
                let loadBuffer = Buffer_JADEPORTED.from(data, "binary");
                let readPos = 0;
                while (true){
                    if (readPos == loadBuffer.length)
                        break;
                    let index = loadBuffer.readUInt8(readPos ++);
                    let end = index % 2 == 1;
                    index = Math.floor(index / 2);

                    if (index == 0){
                        break;
                    }

                    let dataSize = loadBuffer.readUIntBE(readPos, 5); 
                    readPos += 5;
                    let data = loadBuffer.subarray(readPos, readPos + dataSize).toString("binary");
                    readPos += dataSize;

                    this.incomingDataQueue[index] = (this.incomingDataQueue[index] || "") + data;

                    if (end){
                        // console.log(Buffer_JADEPORTED.from(this.incomingDataQueue[index]).toString("hex"));
                        this.fireEvent("message", {
                            data: this.incomingDataQueue[index]
                        })

                        delete this.incomingDataQueue[index];
                    }
                }

                this.websocket.send("\0\0\0\0");
            }
        });
    }

    initiateDataCycle(loadBuffer: Buffer_JADEPORTED){
        return new Promise<void>((accept)=>{
            for (let i = 0;i<loadBuffer.byteLength;i++){
                loadBuffer.writeUInt8(0, i);
            }
            let bytesUsed = 0;
    
            this.outgoingDataQueue = this.outgoingDataQueue.sort((va1, va2)=>va1.length - va2.length);
    
            
            for (let outgoingData of this.outgoingDataQueue){
                if (bytesUsed > this.bandwidthLimitation - 7){
                    console.debug(`Reached bandwidth limitation. Dropped a simultaneous outgoing data task. At ${bytesUsed} bytes used, with capacity ${this.bandwidthLimitation} bytes`);
                    break;
                }
                let indexByteLoction = bytesUsed ++;
                let usedSize = Math.min(outgoingData.length - outgoingData.readPos, this.bandwidthLimitation - bytesUsed - 5);
                bytesUsed = loadBuffer.writeUIntBE(usedSize, bytesUsed, 5);
                bytesUsed += loadBuffer.write(outgoingData.data.substring(outgoingData.readPos, outgoingData.readPos + usedSize), bytesUsed, "binary");
                outgoingData.readPos += usedSize;
                loadBuffer.writeUInt8(outgoingData.index * 2 + (outgoingData.readPos == outgoingData.length ? 1 : 0), indexByteLoction);
            }
    
            let onCallback = (messageEvent: MessageEvent)=>{
                if (messageEvent.data == "\0\0\0\0"){
                    this.websocket.removeEventListener("message", onCallback);
                    let bytesRemaining = 0;
                    let i = 0;
                    while (i < this.outgoingDataQueue.length){
                        let outgoingData = this.outgoingDataQueue[i];
                        bytesRemaining += outgoingData.length - outgoingData.readPos;
                        if (outgoingData.length == outgoingData.readPos){
                            outgoingData.callback();
                            this.outgoingDataQueue.splice(i, 1);
                            i -= 1;
                        }
                        i += 1;
                    }
                    accept();
                    // console.log(`Activity: ${Math.round(bytesUsed / loadBuffer.length * 100)}%; Bytes Remaining: ${bytesRemaining} bytes; Buffer Usage: ${128 - this.avaliableIndexes.length}`);
                }
            };
            
    
            this.websocket.send(loadBuffer.toString("binary"));
            this.websocket.addEventListener("message", onCallback)
        });
    }

    async startDataCycle(){
        
        if (this.dataCycleInProgress)
            
            return;

        let loadBuffer = Buffer_JADEPORTED.alloc(this.bandwidthLimitation);

        this.dataCycleInProgress = true;

        while (this.outgoingDataQueue.length > 0){
            await this.initiateDataCycle(loadBuffer);
        }

        this.dataCycleInProgress = false;
    }

    send(data: string){
        return new Promise<void>((accept, reject)=>{
            let avaliableIndex = this.avaliableIndexes.shift();

            if (avaliableIndex === undefined){
                reject("Overflowed Buffer.");   
                return;
            }

            this.startDataCycle();
            this.outgoingDataQueue.push({
                index: avaliableIndex,
                data,
                readPos: 0,
                length: data.length,
                callback: ()=>{
                    let b = this.avaliableIndexes.reverse();
                    b.push(avaliableIndex!);
                    this.avaliableIndexes = b.reverse();
                    accept();
                }
            });
        });
    }
}

class TransmissionController extends EventEmitter<{
    close: undefined,
    ping: undefined,
}>{

    online = true;
    pingLatency: number = -1;

    messageQueue: TransmitMessage[] = [];
    currentMessageIDCycle = 0;

    password?: string;
    fullAccess = false;

    messageListeners: Map<string, ((messageRequest: {
        messageType: string;
        replyType: ReplyType;
        
        accept?: (...args: any[])=>(void);
        reject?: (error: string)=>(void);
    }, ...data: any[])=>(void))> = new Map();

    updateRequests = (newMessageTask?: TransmitMessage)=>{};

    listenMessage(messageType: string, messageListener: (messageRequest: MessageRequest, ...data: any[])=>(void)){
        this.messageListeners.set(messageType, messageListener);
    }
    
    sendMessage(messageParameters: MessageParameters, ...messageContent: any[]){
        if (this.online == false)
            return console.warn(`Attempted to send a message to a cut transmission. Couldn't complete task!`);


        let newMessageTask = {
            messageContent,
            messageType: messageParameters.messageType,
            replyType: messageParameters.replyType,
            messageID: this.currentMessageIDCycle ++,
            messageTimeSinceSent: Date.now(),
            lastCheckInTimeSince: Date.now(),
            hasReceived: false,
            hasSent: false,
            callback: messageParameters.callback
        };
        this.updateRequests(newMessageTask);
    }

    constructor(transmission: GenericTransmission, config: {password?: string} = {}){
        super();
        this.password = config.password;
        if (this.password === undefined){
            this.fullAccess = true;
        }
        let websocket = transmission.currentlyConnectedSocket as WebSocket | undefined;
        let loadBalancer = new TransmissionLoadBalancer(websocket!);

        if (websocket){

            let timeSincePingInitalization = Date.now();
            let missedPings = 0;
            let recievedPong = true;

            let upToDate = false;

            let deliverMessage = (messageType: "ping" | "pong" | "transmitTask" | "transmitTaskStatus" | "authenticate", ...args: any[])=>{
                console.debugDetailed(`Sent ${messageType}`)
                switch(messageType){
                    case "ping":{
                        loadBalancer.send(JadeStruct.toJadeStruct([0]).toString("binary"));
                        break;
                    };
                    case "pong":{
                        loadBalancer.send(JadeStruct.toJadeStruct([1]).toString("binary"));
                        break;
                    }
                    case "transmitTask":{
                        let newMessageTask = args[0] as TransmitMessage;

                        let messageEnumerator = {
                            "feedback": 0,
                            "inform": 1,
                            "careless": 2,
                        }[newMessageTask.replyType];

                        if (newMessageTask.beingSent)
                            break;
                        
                        newMessageTask.beingSent = true;
                        loadBalancer.send(JadeStruct.toJadeStruct([3, 
                            newMessageTask.messageID,
                            newMessageTask.messageType,
                            newMessageTask.messageContent,
                            messageEnumerator
                        ]).toString("binary"))
                        break;
                    }
                    case "transmitTaskStatus":{
                        let messageTask = args[0] as TransmitTask;

                        if (messageTask.beingSent)
                            break;

                        messageTask.beingSent = true;
                        loadBalancer.send(JadeStruct.toJadeStruct([
                           4,
                           messageTask.error,
                           messageTask.messageID,
                           messageTask.content,
                        ]).toString("binary"))
                        break;
                    }
                    case "authenticate":{
                        loadBalancer.send(JadeStruct.toJadeStruct([10, this.password]).toString("binary"));
                    }
                }
            }
            this.updateRequests = (newMessageTask?: TransmitMessage)=>{

                if (newMessageTask){
                    if (newMessageTask.replyType != "careless")
                        this.messageQueue.push(newMessageTask);
                    deliverMessage("transmitTask", newMessageTask);
                    return;
                }
            };
            let onMessage = (messageEvent: {data: string})=>{
                let parsedMessage = JadeStruct.toObject(messageEvent.data);
                
                let messageType = parsedMessage[0];
                console.debug(`Transmission Controlled Recieved Message of type: ${messageType}`);
                
                switch(messageType){
                    case 0:{ //PING
                        console.debugDetailed("Recieved a Ping Command. Sending Pong Command.");
                        deliverMessage("pong");
                        break;
                    }
                    case 1:{
                        this.pingLatency = Date.now() - timeSincePingInitalization;
                        console.debug(`Ping Action Successful! Ping Latency: ${this.pingLatency} ms`);
                        recievedPong = true;
                        this.fireEvent("ping");
                        break;
                    }
                    case 3:{
                        if (this.fullAccess == false){
                            console.debug("Got a request but full access is still not given. The other end of the transmission needs to authenticate.");
                            break;
                        }
                        let messageID = parsedMessage[1] as number;
                        let messageType = parsedMessage[2] as string;
                        let messageContent = parsedMessage[3] as any[];
                        let replyType = ["feedback", "inform", "careless"][parsedMessage[4]] as "feedback" | "inform" | "careless";

                        let messageTask: TransmitTask = {
                            messageID,
                            ready: false,
                        };

                        // if (replyType == "feedback")
                        //     currentActiveTasks.push(messageTask);

                        console.debugDetailed(`Recieved a new message task! Doing them now! ${messageType}`);
                        let listener = this.messageListeners.get(messageType);

                        let callback = (...data: any[])=>{
                            if (replyType == "feedback"){
                                if (messageTask.ready == false){
                                    messageTask.ready = true;
                                    messageTask.content = data;
                                    messageTask.timeSinceSent = Date.now();
                                    console.debugDetailed(`Sent the results of the message ${messageTask.messageID}`);
                                    deliverMessage("transmitTaskStatus", messageTask);
                                }else{
                                    throw new Error("Cannot send data on a dead primary thread that handles the Message Task.");
                                }
                            }
                        };
                        if (replyType == "inform"){
                            messageTask.ready = true;
                            messageTask.timeSinceSent = Date.now();
                            console.debugDetailed(`Sent a reply that the inform was met!`);
                            deliverMessage("transmitTaskStatus", messageTask);
                        }
                        if (listener){
                            try{
                                listener({
                                    replyType,
                                    messageType,
                                    accept: replyType == "feedback" ? callback : undefined,
                                    reject: replyType == "feedback" ? function (error: string): void {
                                        messageTask.error = `Rejected Message: ${error}`;
                                        callback(undefined);
                                    } : undefined
                                }, ...messageContent);
                            }
                            catch(er){
                                messageTask.error = `Uncaught Exception in Main Thread for ${messageType}: Posted in server's consolescript.`;
                                console.error(`Uncaught Exception in Main Thread for ${messageType}: ${er}`);
                            }
                        }else{
                            messageTask.error = "Unbound Message: No listeners bounded for this message type, message type is not defined.";
                            callback(undefined);
                        }
                        break;
                    }
                    case 4:{
                        if (this.fullAccess == false){
                            console.debug("Got a request but full access is still not given. The other end of the transmission needs to authenticate.");
                            break;
                        }
                        let error = parsedMessage[1];
                        let messageID = parsedMessage[2];
                        let messageContent = parsedMessage[3] as any[] || [undefined];

                        let messageQueueIndex = this.messageQueue.findIndex(va=>va.messageID==messageID);

                        if (messageQueueIndex != -1){
                            let message = this.messageQueue.splice(messageQueueIndex, 1)[0]!;
                            console.debugDetailed(`Message ${message.messageID} has been finished!`);
                            if (error){
                                console.warn(`Transmission Message handled an Error: ${error}`);
                            }
                            if (message.callback)
                                message.callback({
                                    error,
                                    replyType: message.replyType,
                                    messageType: message.messageType
                                }, ...messageContent);
                        }else{
                            // throw new Error(`An unexpected error has occured when recieving a message. Offending MessageID: ${messageID}`);
                        }
                        break;
                    }
                    case 5:{
                        if (this.fullAccess == false){
                            console.debug("Got a request but full access is still not given. The other end of the transmission needs to authenticate.");
                            break;
                        }
                        let remainingTasksStatusReport = parsedMessage[1] as {
                            Report: TransmitTask[],
                            ActiveTasks: number
                        };

                        console.debugDetailed("Received Reports: ", remainingTasksStatusReport);

                        // if (remainingTasksStatusReport.ActiveTasks == 0 && this.messageQueue.length == 0){
                        //     this.currentMessageIDCycle = 0;
                        // }

                        for (let task of remainingTasksStatusReport.Report){
                            if (task.hasRecieved == false){
                                let message = this.messageQueue.find(va=>va.messageID == task.messageID)!;

                                if (message == null){
                                    console.warn(`Transmission has received unexpected report of messageID: ${task.messageID}.`);
                                    continue;
                                }

                                if (Date.now() - message.messageTimeSinceSent > 2000){
                                    message.messageTimeSinceSent = 2000;
                                    deliverMessage("transmitTask", message);
                                }
                            }
                        }
                        break;
                    }
                    case 10:{
                        console.debug("Received an authentication request.");
                        let password = parsedMessage[1] as string;
                        
                        if (this.password){
                            if (this.password == password){
                                this.fullAccess = true;
                                console.debug(`Authentication verified. Allowed full transmission!`);
                            }else{
                                console.debug(`Authentication failed. Wrong password, cutting transmission...`);
                                websocket!.close();
                                this.fireEvent("close");
                            }
                        }else{
                            console.debug(`Authentication request is not needed as password verification is not set in configs.`);
                        }
                        break;
                    }
                }
            };

            if (this.password){
                deliverMessage("authenticate", this.password);
            }

            loadBalancer.addEventListener("message", onMessage);

            let pingInterval = setInterval(()=>{
                if (recievedPong){
                    recievedPong = false;
                    missedPings = 0;
                }else
                    missedPings += 1;

                if (missedPings > 2){
                    this.online = false;
                    this.fireEvent("close");
                    websocket!.close();
                    if (ActivatedTransmission.prototype == Object.getPrototypeOf(transmission)){
                        (transmission as ActivatedTransmission).httpSocket!.destroy();
                    }
                    console.debug(`The Transmission has been cut short due to two missed pings.`);
                    return;
                }
                deliverMessage("ping");
                // this.updateRequests();
                timeSincePingInitalization = Date.now();
            }, 1000);

            this.once("close", ()=>{
                this.online = false;
                clearInterval(pingInterval);
                websocket!.removeEventListener("message", onMessage);
                console.debug(`The Transmission has been cut.`);
            });
            
            websocket.addEventListener("close", ()=>{
                this.endEvent("close");
            }, {once:true});
        }else
            throw new Error("Failed to create the controller on a dead socket.");
    }
}

export class ActivatedTransmission implements GenericTransmission{

    websocketKey: string;
    currentlyConnectedSocket: import("ws").WebSocket | undefined;

    connectedRemoteAddress: string | undefined;
    connectedPort: number | undefined;
    httpSocket: import("stream").Duplex | undefined;


    constructor(websocketKey: string){
        this.websocketKey = websocketKey;
    }

    listen(messageType: string, messageListener: ((messageRequest: MessageRequest, ...data: any[])=>(void))): void {
        this.controller!.listenMessage(messageType, messageListener);
    }
    send(messageParameters: MessageParameters, ...messageContent: any[]): void {
        this.controller!.sendMessage(messageParameters, ...messageContent);
    }

    controller: TransmissionController | undefined;

    transmit(socket: import("ws").WebSocket, password?: string){

        if (this.currentlyConnectedSocket){
            throw new Error("Cannot Transmit when this ActivatedTransmission is already transmitting.");
        }

        this.currentlyConnectedSocket = socket;
        
        this.controller = new TransmissionController(this, {password});
        
        console.debug(`The Transmission ${this.websocketKey} is online, and is listening into the abyss.`);

        return this.controller;
    }
    
    cut(){
        this.currentlyConnectedSocket!.close();
        this.controller = undefined;
    }
}

export class TransmissionServer extends EventEmitter<{
    transmit: ActivatedTransmission,
    cut: undefined,
}>{

    private currentWebSocketServer: import("ws").WebSocketServer | null = null;
    private currentlyActivatedTranmissions: Map<string, ActivatedTransmission> = new Map();
    private onFeedbackListeners: Map<string, (messageRequest: MessageRequest, ...args: any[])=>(void)> = new Map();
    
    private password?: string;

    public activedTransmissionListener: ((newActivedTransmission: ActivatedTransmission)=>(void)) | undefined;

    private activateTranmission(websocketKey: string){
        let activatedTranmission = this.currentlyActivatedTranmissions.get(websocketKey);

        if (!activatedTranmission){
            activatedTranmission = new ActivatedTransmission(websocketKey);
            this.currentlyActivatedTranmissions.set(websocketKey, activatedTranmission);
            console.debug(`The Transmission for ${websocketKey} has been activated!`);
        }else{
            console.debug(`The Transmission for ${websocketKey} has already been activated!`);
        }
    
        
        return activatedTranmission;
    }
    
    private deactivateTranmission(websocketKey: string){
   
        let activatedTransmission = this.currentlyActivatedTranmissions.get(websocketKey);
        activatedTransmission!.cut();
        this.currentlyActivatedTranmissions.delete(websocketKey);
        
        
        console.debug(`The Transmission for ${websocketKey} has been deactivated!`);
    }
    
    public onAllMessage(messageType: string, callback: (messageRequest: MessageRequest, ...args: any[])=>(void)){
        this.onFeedbackListeners.set(messageType, callback);
        
        for (let activatedTransmission of this.currentlyActivatedTranmissions.values()){
            activatedTransmission.controller?.listenMessage(messageType, (messageRequest, ...args)=>{
                callback(messageRequest, ...args);
            });
        }
    }

    public informAll(messageType: string, ...args: any[]){
        for (let activatedTransmission of this.currentlyActivatedTranmissions.values()){
            activatedTransmission.controller!.sendMessage({messageType, replyType: "inform"}, ...args);
        }
    }

    public carelessAll(messageType: string, ...args: any[]){
        for (let activatedTransmission of this.currentlyActivatedTranmissions.values()){
            activatedTransmission.controller!.sendMessage({messageType, replyType: "careless"}, ...args);
        }
    }

    constructor(config: {password?: string} = {}){
        super();
        this.currentWebSocketServer = new (loadedModules!.WebSocketServer)({
            noServer: true
        });

        this.password = config.password;

        this.currentWebSocketServer.on("connection", (socket, request)=>{

            let websocketKey = request.headers["sec-websocket-key"]!;
            let activatedTransmission = this.activateTranmission(websocketKey);
            activatedTransmission.transmit(socket, this.password);

            this.fireEvent("transmit", activatedTransmission);

            activatedTransmission.controller?.once("close", ()=>{
                this.fireEvent("cut", undefined);
            })

            if (this.activedTransmissionListener){
                this.activedTransmissionListener(activatedTransmission);
            }
        });
    }

    public listenHTTPServer(server: import("http").Server){

        server.on("upgrade", (request, socket, head)=>{
            let remoteAddress = (socket as any).remoteAddress as string;
            let remotePort = (socket as any).remotePort as number;
            let webSocketKey = request.headers["sec-websocket-key"]!;
            let tranmission: ActivatedTransmission | undefined;

            tranmission = this.activateTranmission(webSocketKey);

            for (let globalMessageType of this.onFeedbackListeners.keys()){
                tranmission.controller?.listenMessage(globalMessageType, (messageRequest, ...data)=>{
                    this.onFeedbackListeners.get(globalMessageType)!(messageRequest, ...data);
                });
            }
            
            tranmission.connectedRemoteAddress = remoteAddress;
            tranmission.httpSocket = socket;
            tranmission.connectedPort = remotePort;
            console.debug(`Identified the connected Transmission ${webSocketKey} to be from ${tranmission.connectedRemoteAddress}:${tranmission.connectedPort}`);

            this.currentWebSocketServer!.handleUpgrade(request, socket, head, (socket, request)=>{
                this.currentWebSocketServer!.emit("connection", socket, request);
            });

            socket.once("close", ()=>{
                if (tranmission){
                    this.deactivateTranmission(tranmission.websocketKey);
                    console.debug(`The Connection to ${tranmission.connectedRemoteAddress}:${tranmission.connectedPort} has been destroyed.`);
                }else
                    console.debug("The Connection has been unexpectedly quickly closed. This device was not identified.");
            });
        });
    }

    public listenOnPort(port: number, options?:{
        secure?: {
            cert: string | Buffer,
            key: string | Buffer,
        },
    }){
        if (!options?.secure){
            let httpServer = loadedModules!.HTTP.createServer();
            this.listenHTTPServer(httpServer);
            httpServer.listen(port);
        }else{
            let httpsServer = loadedModules!.HTTPs.createServer({
                cert: options.secure.cert,
                key: options.secure.key
            });
            this.listenHTTPServer(httpsServer);
            httpsServer.listen(port);
        }
    }
}


export class LowLevelTransmission extends EventEmitter<{
    close: undefined,
    transmit: undefined,
    reconnecting: undefined,
}>{

    protected currentlyConnectedSocket: typeof WebSocket.prototype | undefined;

    protected hostName: string;
    protected port: number;
    protected path: string;
    protected secure: boolean;
    protected password: string | undefined;

    constructor(hostname?: string, port?: number, secure?: boolean, path?: string, password?: string){
        super();
        if (isWebBrowser){
            secure = secure || document.location.href.match(/^https/) != null;
            hostname = hostname || document.location.hostname;
            port = port || Number(document.location.port) || (document.location.protocol == "https:" ? 443 : 80);
        }else{
            secure = secure || false;
            if (!hostname){
                throw new Error("Cannot create a LowLevelTransmission Client with no Hostname");
            }
            port = port || (secure ? 443 : 80);
        }

        this.hostName = hostname;
        this.port = port;
        this.path = path || "";
        this.secure = secure;
        this.password = password;
        
    }
}

export class Transmission extends LowLevelTransmission implements GenericTransmission{

    public autoReconnect = true;
    public delayToAutoReconnect = 1000;

    constructor(hostname?: string, port?: number, args: {
        hostname?: string;
        port?: number;
        secure?: boolean;
        path?: string;
        password?: string;
        autoReconnect?: boolean,
        delayToAutoReconnect?: number,
    } = {}){
        super(hostname || args.hostname, port || args.port, args.secure, args.path, args.password);

        this.autoReconnect = args.autoReconnect || false;
        this.delayToAutoReconnect = args.delayToAutoReconnect || 250;
    }

    controller: TransmissionController | undefined;
    declare currentlyConnectedSocket: WebSocket | WebSocket | undefined;

    public trustedCAs: string[] = (()=>{
        if (isWebBrowser)
            return [];
        let certificates: string[]  = [`-----BEGIN CERTIFICATE-----
MIIGQjCCBCoCCQCt8tI7yxq1QjANBgkqhkiG9w0BAQsFADCB4jELMAkGA1UEBhMC
Q0ExEDAOBgNVBAgMB0FsYmVydGExEDAOBgNVBAcMB0NhbGdhcnkxGjAYBgNVBAoM
EUphZGUgSW5jb3Jwb3JhdGVkMTowOAYDVQQLDDFUaGVKYWRlcydzIENlcnRpZmlj
YXRlIEF1dGhvcml0eSBmb3IgUGVyc29uYWwgVXNlMS0wKwYDVQQDDCRSb290IEF1
dGhvcml0eSBvZiBUaGVKYWRlcydzIE5ldHdvcmsxKDAmBgkqhkiG9w0BCQEWGXRo
ZWphZGVzaXNmYXQ3N0BnbWFpbC5jb20wHhcNMjIwODIyMDU1NTU3WhcNMjcwODIx
MDU1NTU3WjCB4jELMAkGA1UEBhMCQ0ExEDAOBgNVBAgMB0FsYmVydGExEDAOBgNV
BAcMB0NhbGdhcnkxGjAYBgNVBAoMEUphZGUgSW5jb3Jwb3JhdGVkMTowOAYDVQQL
DDFUaGVKYWRlcydzIENlcnRpZmljYXRlIEF1dGhvcml0eSBmb3IgUGVyc29uYWwg
VXNlMS0wKwYDVQQDDCRSb290IEF1dGhvcml0eSBvZiBUaGVKYWRlcydzIE5ldHdv
cmsxKDAmBgkqhkiG9w0BCQEWGXRoZWphZGVzaXNmYXQ3N0BnbWFpbC5jb20wggIi
MA0GCSqGSIb3DQEBAQUAA4ICDwAwggIKAoICAQDFbkt5TQsT2cSQQwW94KIBB1G3
1/Igmw6H+ZVu/wGXOhCGYDhWUq5EZiNQxnPa/sCMl1/zli5qreNd8dL1EKGUhTdI
qK5uXY+N2+vN4j+0WFH+DZxY8LmjEMD3h+ad6+sn4siJmrAsvaYLLjFKF3vHiAJ4
/AXUhCFNPi3o+OwNdrYQNv05K3EDP1RIwwc5HkN3A0/s9Sva3FMjOXv61pecbaaq
JdenX1Ye80fnzE8hISEgP4rXFqoPvzqa/vx9aozyntFVb/U+d76rGAWx9waoRbnu
o8Rbm/cYoAuuk0juCBh6dR2fp0eKhFnVQ2th83UXTIvGAERv8g9kusNKPOdANDsE
z4RUmlLSGMxR6NffeeAWGUP/ZY3eS8Is78ven7VyQXfX7y1ZKuc4zVLFDTRuf9kz
OTVX9bvNqv8mVZV/0Wmh66vxiwzVllM0DPZTYex9aINg8uZSD0YcBv8OpJfnVPjY
lFg7DEszC7/YH8huJxb+I+31ePvaIO8AdFnuPXYKYpVqROdcv+1J2r5+4PUfwLqA
AxSp+yrckYl46e9e/9/1uGVCwwLWMgShER79Tv2PXO5raw5hDZ1DIzxmnflxvTz9
5hSVHdw0r5zvHXyJn0JwCYsdB+yKVDHGG9ZRcwNrXI1WoQo9VdL3rKbzmbpszeF6
3DV816S77gG+OPpMHQIDAQABMA0GCSqGSIb3DQEBCwUAA4ICAQBOciEBxA4czjaG
01EqvT7SJ5F2TqcsHIm70W5d5b1eM9umGMnlM09BMyEvTGYrDqE6UJKu5FHpccrE
Zd7kkuoCSXr5ed4iHvt0d6UcrMOVgs9lPOenol4IGOhlq5P76a4oxEXn57J7k56y
qYGHZbs5rXGZzB72mqD6zYZwrnUd28UOneWdptdt+ZBH4R0Ouljjl3xJ7cZXON2u
ppMG4KpQpLYRdcd4GYQ2z1CFD9Sw1XrVphGUquz7AH3T3mC1/NZ2/6J9tbRW36D6
hBfj7UW3pXHZiDxwsAPbm4A9HXhboI/occruIh+EDxCFRg0bqbzroVn8+4LFNoO6
UH2IXR8guWz0MAnZLxMO/6ktgwYqH1CVt6rZrNObqGgi+PC4afmqyUPjgMThLY+v
olTp7za+PhyVS03Wt4n+rSbxFVXSSkx9rcs0va8RBJDypXoQFeNxA4TB7+4D+FUN
Pxxi2TgXHrCYPr+M9ZYO8SPpaIAE8G6OQt9zkhn4QMt2YZTPgyUxPk9IrpaEK4vd
7gKDnZyBH5B1vFiv17liJx+vXdRjL27h05nnb4dkMRCpj97mMAEBnsw4SRCFQ6J2
ScsMHmXJLcTmVzGNiF8M45iZipxIa8/UYBWhUpPe10nBzywS1LFLPz8vcK7/DQ/W
o6O53P1YdA0x+Lfox1012C9h+39gaw==
-----END CERTIFICATE-----`];

        if (loadedModules == null){
            throw new Error("Cannot use the transmission module without loading its module using attemptLoadModule!");
        }

        for (let certificate of loadedModules!.rootCertificates){
            certificates.push(certificate);
        }
        
        return certificates;
    })();

    listen(messageType: string, messageListener: ((messageRequest: MessageRequest, ...data: any[])=>(void))): void {
        this.controller!.listenMessage(messageType, messageListener);
    }
    
    send(messageParameters: MessageParameters, ...messageContent: any[]): void {
        this.controller!.sendMessage(messageParameters, ...messageContent);
    }
    
    transmit(){        
        return new Promise<void>(async (accept, reject)=>{
            if (this.currentlyConnectedSocket)
                return reject("Cannot open a LowLevelTransmission that's already opened!");

            let urlConstructor = "";
            urlConstructor = `${this.secure ? "wss" : "ws"}://${this.hostName}:${this.port}/${this.path}`;
    
            let webSocket = this.currentlyConnectedSocket = (isWebBrowser ? new WebSocket(urlConstructor) : (new (loadedModules!.WebSocket!)(urlConstructor, {ca: this.trustedCAs}) as unknown) as typeof WebSocket.prototype);

            let alreadyClosedSession = false;

            let attemptClose = ()=>{
                if (alreadyClosedSession)
                    return;
                this.fireEvent("close");
                alreadyClosedSession = true;
                this.currentlyConnectedSocket = undefined;
                if (this.autoReconnect){
                    this.fireEvent("reconnecting");
                    setTimeout(()=>this.transmit().catch((er)=>console.error(`Failed to reconnect Transmission! ${er}`)), this.delayToAutoReconnect);
                }
            };

            webSocket.addEventListener("open", ()=>{
                this.controller = new TransmissionController(this, {
                    password: this.password
                });
                this.controller.once("close", ()=>{
                    attemptClose();  
                });
                this.fireEvent("transmit");
                accept();
            }, {once: true});
            webSocket.addEventListener("close", ()=>{
                attemptClose();
            }, {once: true});
            webSocket.removeEventListener("error", (err)=>{
                reject(err);
            });

        });
    }

    cut(){
        this.currentlyConnectedSocket?.close();
    }
}

export class LegacyTransmissionServer{

    public newTransmissionServer: TransmissionServer;
    
    constructor(authenticationKey: string | null = null){
        this.newTransmissionServer = new TransmissionServer();
    }

    sendMessage(messageTask: string, content: any){
        this.newTransmissionServer.informAll(messageTask, content);
    }

    attachListener(messageTask: string, processor: (messageData: any)=>(Promise<any>)){
        this.newTransmissionServer.onAllMessage(messageTask, (messageRequest, messageData)=>{
            if (messageRequest.replyType == "feedback"){
                processor(messageData).then((messageData: any)=>{
                    messageRequest.accept!(messageData);
                });
            }else{
                console.warn(`Legacy Transmission Server couldn't process the new replytype ${messageRequest.replyType} for ${messageTask}.`);
            }
        })
    }
}

export class LegacyTransmission{

    public transmission: Transmission;
    
    constructor(hostname: string, port = 443, authenticationKey: string | null = null) {
        this.transmission = new Transmission(hostname, port, {
            password: authenticationKey || undefined,
            autoReconnect: true,
            delayToAutoReconnect: 500,
        });
    }

    queryMessage(messageTask: string, messageContent: any){
        return new Promise<any>((accept, reject)=>{
            this.transmission.send({
                messageType: messageTask,
                replyType: "feedback",
                callback(response, data){
                    if (response.error){
                        reject(response.error);
                    }
                    accept(data);
                }
            })
        });
    }

    attachGlobalMessageListener(messageTask: string, messageListener: (messageData: any)=>(void)){
        this.transmission.listen(messageTask, (messageRequest, messageData)=>{
            if (messageRequest.replyType == "inform"){
                messageListener(messageData);
            }else{
                console.warn(`Legacy Transmssion does not support the replytype ${messageRequest.replyType} for ${messageTask}!`);
            }
        });
    }

    attemptContent(){
        return this.transmission.transmit();
    }
}