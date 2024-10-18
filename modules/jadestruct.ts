/**
 * JadesTS-JS MODULES >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
 * -----------------------------------------------------
 * JADESTRUCT.TS
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


import * as console from "./consolescript.js"

export const isWebBrowser = (()=>{
    try{
        let a = process;
        return false;
    }
    catch(err){
        return true;
    }
})();

export class Buffer_JADEPORTED{

    private static defaultBuffer = new ArrayBuffer(0);
    private currentDataView = new DataView(Buffer_JADEPORTED.defaultBuffer);
    private currentBuffer = Buffer_JADEPORTED.defaultBuffer;

    private startFromSlice: number;
    private endToSlice: number;

    public readonly length: number;
    public readonly byteLength: number;

    private constructor(copyMode: "point" | "allocate" = "allocate", options:{
        allocationSize?: number,
        fromSlice?: number,
        toSlice?: number,
        pointingBuffer?: Buffer_JADEPORTED,
        pointingArrayBuffer?: ArrayBuffer
    }){
        switch(copyMode){
            case "allocate":{
                this.currentBuffer = new ArrayBuffer(options.allocationSize!);
                this.currentDataView = new DataView(this.currentBuffer);
                this.startFromSlice = 0;
                this.endToSlice = this.currentBuffer.byteLength;
                break;
            }
            case "point":{
                if (options.pointingArrayBuffer){
                    let pointingArrayBuffer = options.pointingArrayBuffer;

                    this.currentBuffer = pointingArrayBuffer;
                }else{
                    let pointingBuffer = options.pointingBuffer!;
    
                    this.currentBuffer = pointingBuffer.currentBuffer;
                }
                this.startFromSlice = options.fromSlice!;
                this.endToSlice = options.toSlice!;
                this.currentDataView = new DataView(this.currentBuffer, this.startFromSlice, this.endToSlice - this.startFromSlice);

                break;
            }
        }

        this.length = this.endToSlice - this.startFromSlice;
        this.byteLength = this.length;
    }

    public toString(encodingMethod: "binary" | "hex" | "utf-8"): string{
        switch(encodingMethod){
            case "utf-8":{
                let decoder = new TextDecoder();
                return decoder.decode(this.currentBuffer.slice(this.startFromSlice, this.endToSlice));
                break;
            }
            case "binary":{
                let data = "";

                for (let i = 0;i<this.currentDataView.byteLength;i++){
                    data += String.fromCodePoint(this.currentDataView.getUint8(i));
                }

                return data;
            }
            case "hex":{
                let data = "";

                for (let i = 0;i<this.currentDataView.byteLength;i++){
                    let byte = this.currentDataView.getUint8(i);

                    let hexdecimalCharacter = (()=>{
                        let digit = Math.floor(byte / 16) % 16;

                        if (digit < 10){
                            return `${digit}`;
                        }else{
                            return `${String.fromCharCode(65 + digit - 10)}`
                        }
                    })() + (()=>{
                        let digit = byte % 16;

                        if (digit < 10){
                            return `${digit}`;
                        }else{
                            return `${String.fromCharCode(65 + digit - 10)}`
                        }
                    })();

                    data += hexdecimalCharacter + " ";
                }

                return data;
            }
        }
    }

    public static alloc(byteLength: number){
        let newBuffer = new Buffer_JADEPORTED("allocate", {
            allocationSize: byteLength
        });
        return newBuffer;
    }

    public static from(data: string, encodingMethod: "binary" | "utf-8" | "hex" = "utf-8"): Buffer_JADEPORTED{
        switch (encodingMethod){
            case "utf-8":{
                let encoder = new TextEncoder();
                let rawData = encoder.encode(data);
        
                let newBuffer = new Buffer_JADEPORTED("point", {
                    fromSlice: 0,
                    toSlice: rawData.byteLength,
                    pointingArrayBuffer: rawData.buffer
                })
        
                return newBuffer;
            }
            case "binary":{
                let newBuffer = Buffer_JADEPORTED.alloc(data.length);
                
                for (let i = 0;i<data.length;i++){
                    newBuffer.writeUInt8(data.codePointAt(i)!, i);
                }
                return newBuffer;
            }
            case "hex":{
                data = data.replace(/ /g, "").toUpperCase();
                let byteLength = Math.ceil(data.length / 2);
                let newBuffer = Buffer_JADEPORTED.alloc(byteLength);

                for (let i = 0;i<byteLength;i++){
                    let digit2 = data.charCodeAt(i * 2);
                    let digit1 = data.charCodeAt(i * 2 + 1);

                    digit2 = digit2 <= 57 ? digit2 - 48 : digit2 - 55;
                    digit1 = digit1 <= 57 ? digit1 - 48 : digit1 - 55;

                    newBuffer.writeUInt8(digit2 * 16 + digit1, i);
                }
                return newBuffer;
            }
        }
    }

    public readUIntBE(offset: number, byteLength: number): number{
        let number = 0;

        for (let i = 0;i<byteLength;i++){
            number += this.currentDataView.getUint8(i+ offset) * Math.pow(256, byteLength - i - 1);
        }

        return number;
    }

    public writeUIntBE(value: number, offset: number, byteLength: number): number{
        for (let i = 0;i<byteLength;i++){
            let power = Math.pow(256, byteLength - i - 1);
            this.currentDataView.setUint8(i + offset, Math.floor(value / power) % (power * 256));
        }
        return offset + byteLength;
    }

    public writeDoubleBE(value: number, offset: number){
        this.currentDataView.setFloat64(offset, value, false);
        return offset + 8;
    }

    public readDoubleBE(offset: number = 0){
        return this.currentDataView.getFloat64(offset, false);
    }

    public checkPointerBounds(cursor: number){
        if (cursor < 0){
            throw new Error(`Cannot write to the Buffer of a cursor less than 0. Cursor is at ${cursor}`);
        }
        if (cursor >= this.currentDataView.byteLength){
            throw new Error(`Cannot write to the Buffer of a cursor greater than or equal to ${this.currentDataView.byteLength}. Cursor is at ${cursor}`);
        }

        return cursor;
    }

    public write(data: string, offset: number = 0, encodingMethod: "utf-8" | "binary" = "utf-8"){
        switch (encodingMethod){
            case "utf-8":{
                let encoder = new TextEncoder();
                let rawData = encoder.encode(data);
        
                for (let i = 0;i<rawData.byteLength;i++){
                    this.currentDataView.setUint8(this.checkPointerBounds(i + offset), rawData[i]);
                }
        
                return rawData.byteLength;
            }
            case "binary":{
                
                for (let i = 0;i<data.length;i++){
                    this.currentDataView.setUint8(this.checkPointerBounds(i + offset), data.codePointAt(i)!);
                }
                return data.length;
            }
        }
    }

    public subarray(startFromSlice: number, endToSlice: number = this.endToSlice - this.startFromSlice): Buffer_JADEPORTED{
        let newBuffer = new Buffer_JADEPORTED("point", {
            pointingBuffer: this,
            fromSlice: this.startFromSlice + startFromSlice,
            toSlice: this.startFromSlice + endToSlice
        });
        return newBuffer;
    }

    public readUInt8(offset: number): number{
        return this.currentDataView.getUint8(offset);
    }

    public writeUInt8(value: number, offset: number): number{
        this.currentDataView.setUint8(offset, value);

        return offset + 1;
    }

    public convertToNodeJSBuffer(){
        return Buffer.from(this.currentBuffer).subarray(this.currentDataView.byteOffset, this.currentDataView.byteOffset + this.currentDataView.byteLength);
    }

}

var supportedBufferClass = isWebBrowser ? Buffer_JADEPORTED : Buffer;

type JadeStructDataType = {
    specificationName: string;
    specificationSize: number;
    writeContentFunction: (buffer: typeof supportedBufferClass.prototype, object: any)=>(number);
    readContentFunction: (buffer: typeof supportedBufferClass.prototype, specification: number)=>({Data: any, ReadLength: number});
    generatePrimarySpecifications: (object: any)=>(number);
    generateSecondarySpecifications?: (object: any)=>(number);
    getDynamicSize: (object: any)=>(number);
}

type JadeStructBlueprint = {
    dataHeaderType: number;
    dataHeaderPrimarySpecs: number;

    dataContentLength: number;

    parasableObject: any;
}

export class JadeStruct{

    private static supportedDataType: JadeStructDataType[] = [
        {
            specificationName: "Neg-Int",
            specificationSize: 6,
            generatePrimarySpecifications(object: number) {
                return Math.max(0, Math.ceil(Math.log( - object) / Math.log(255)) - 1);
            },
            getDynamicSize(object: number){
                return this.generatePrimarySpecifications(object) + 1;
            },
            readContentFunction(buffer, specification) {
                return {Data: - buffer.readUIntBE(0, specification + 1), ReadLength: specification + 1};
            },
            writeContentFunction(buffer, object: number) {
                return buffer.writeUIntBE( - object, 0, this.generatePrimarySpecifications(object) + 1);
            },
        },
        {
            specificationName: "Pos-Int",
            specificationSize: 6,
            generatePrimarySpecifications(object: number) {
                return Math.max(0, Math.ceil(Math.log(object) / Math.log(255)) - 1);
            },
            getDynamicSize(object: number){
                return this.generatePrimarySpecifications(object) + 1;
            },
            readContentFunction(buffer, specification) {
                return {Data: buffer.readUIntBE(0, specification + 1), ReadLength: specification + 1};
            },
            writeContentFunction(buffer, object: number) {
                return buffer.writeUIntBE(object, 0, this.generatePrimarySpecifications(object) + 1);
            },
        },
        {
            specificationName: "Date",
            specificationSize: 6,
            generatePrimarySpecifications(object: Date) {
                return Math.max(0, Math.ceil(Math.log(object.getTime()) / Math.log(255)) - 1);
            },
            getDynamicSize(object: Date){
                return this.generatePrimarySpecifications(object) + 1;
            },
            readContentFunction(buffer, specification) {
                return {Data: new Date(buffer.readUIntBE(0, specification + 1)), ReadLength: specification + 1};
            },
            writeContentFunction(buffer, object: Date) {
                return buffer.writeUIntBE(object.getTime(), 0, this.generatePrimarySpecifications(object) + 1);
            },
        },
        {
            specificationName: "Double",
            specificationSize: 6,
            generatePrimarySpecifications(object: number) {
                return 0;
            },
            getDynamicSize(object: number){
                return 8;
            },
            readContentFunction(buffer, specification) {
                return {Data: buffer.readDoubleBE(), ReadLength: 8};
            },
            writeContentFunction(buffer, object: number) {
                return buffer.writeDoubleBE(object, 0);
            },
        },
        {
            specificationName: "Object",
            specificationSize: 6,
            generateSecondarySpecifications(objects: JadeStructBlueprint[]){
                return objects.length;
            },
            generatePrimarySpecifications(objects: JadeStructBlueprint[]) {
                return JadeStruct.secondarySpecificationOperations.generate(this.specificationSize, this.generateSecondarySpecifications!(objects));
            },
            getDynamicSize(objects: JadeStructBlueprint[]){
                return this.generatePrimarySpecifications(objects) + 1;
            },
            readContentFunction(buffer, specification) {
                let secondarySpecificationsResults = JadeStruct.secondarySpecificationOperations.read(buffer, specification);
                let arrayLength = secondarySpecificationsResults.Data;
                let currentReadPointer = secondarySpecificationsResults.ReadLength;
                let object: any = {};

                for (let i = 0;i<arrayLength;i+=2){
                    let keyReadResults = JadeStruct.readJadeStruct(buffer.subarray(currentReadPointer));
                    currentReadPointer += keyReadResults.ReadPointer;
                    let valueReadResults = JadeStruct.readJadeStruct(buffer.subarray(currentReadPointer));
                    currentReadPointer += valueReadResults.ReadPointer;
                    object[keyReadResults.Data] = valueReadResults.Data;
                }

                // console.log(arrayLength);
                return {Data: object, ReadLength: currentReadPointer};
            },
            writeContentFunction(buffer, objects: JadeStructBlueprint[]) {
                return JadeStruct.secondarySpecificationOperations.write(buffer, this.specificationSize, this.generateSecondarySpecifications!(objects));
            },
        },
        {
            specificationName: "Array",
            specificationSize: 6,
            generateSecondarySpecifications(objects: JadeStructBlueprint[]){
                return objects.length;
            },
            generatePrimarySpecifications(objects: JadeStructBlueprint[]) {
                return JadeStruct.secondarySpecificationOperations.generate(this.specificationSize, this.generateSecondarySpecifications!(objects));
            },
            getDynamicSize(objects: JadeStructBlueprint[]){
                return this.generatePrimarySpecifications(objects) + 1;
            },
            readContentFunction(buffer, specification) {
                let secondarySpecificationsResults = JadeStruct.secondarySpecificationOperations.read(buffer, specification);
                let arrayLength = secondarySpecificationsResults.Data;
                let currentReadPointer = secondarySpecificationsResults.ReadLength;
                let array: Array<any> = [];

                for (let i = 0;i<arrayLength;i++){
                    let readResults = JadeStruct.readJadeStruct(buffer.subarray(currentReadPointer));
                    currentReadPointer += readResults.ReadPointer;
                    array.push(readResults.Data);
                }

                // console.log(arrayLength);
                return {Data: array, ReadLength: currentReadPointer};
            },
            writeContentFunction(buffer, objects: JadeStructBlueprint[]) {
                return JadeStruct.secondarySpecificationOperations.write(buffer, this.specificationSize, this.generateSecondarySpecifications!(objects));
            },
        },
        {
            specificationName: "String",
            specificationSize: 6,
            generateSecondarySpecifications(object: string) {
                return supportedBufferClass.from(object, "utf-8").byteLength;
            },
            generatePrimarySpecifications(object: string) {
                return JadeStruct.secondarySpecificationOperations.generate(this.specificationSize, this.generateSecondarySpecifications!(object));
            },
            getDynamicSize(object: string){
                return this.generatePrimarySpecifications(object) + 1 + supportedBufferClass.from(object, "utf-8").byteLength;
            },
            readContentFunction(buffer, specification) {
                let secondarySpecificationsResults = JadeStruct.secondarySpecificationOperations.read(buffer, specification);
                let currentReadPointer = secondarySpecificationsResults.ReadLength;
                let stringLength = secondarySpecificationsResults.Data;
                return {Data: buffer.subarray(currentReadPointer, currentReadPointer + stringLength).toString("utf-8"), ReadLength: stringLength + currentReadPointer};
            },
            writeContentFunction(buffer, object: string) {
                let specificationBytesWritten = JadeStruct.secondarySpecificationOperations.write(buffer, this.specificationSize, this.generateSecondarySpecifications!(object)) 
                return specificationBytesWritten + buffer.write(object, specificationBytesWritten, "utf-8");
            },
        },
        {
            specificationName: "EngString",
            specificationSize: 6, //96
            generateSecondarySpecifications(object: {
                str: string,
                uniqueCharacters: number[]
            }) {
                return object.str.length
            },
            generatePrimarySpecifications(object: {
                str: string,
                uniqueCharacters: number[]
            }) {
                return JadeStruct.secondarySpecificationOperations.generate(this.specificationSize, this.generateSecondarySpecifications!(object));
            },
            getDynamicSize(object: {
                str: string,
                uniqueCharacters: number[]
            }){
                let compressionRatio = 0;
                let baseDigit = 0;
                let compressionMode = (()=>{
                    if (object.uniqueCharacters.length > 6){
                        compressionRatio = 2;
                        baseDigit = 16;
                        return "low";
                    }else if (object.uniqueCharacters.length > 4){
                        compressionRatio = 3;
                        baseDigit = 6;
                        return "medium";
                    }else if (object.uniqueCharacters.length > 2){
                        compressionRatio = 4;
                        baseDigit = 4;
                        return "high";
                    }else if (object.uniqueCharacters.length > 1){
                        compressionRatio = 8;
                        baseDigit = 2;
                        return "extremely-high";
                    }else{
                        compressionRatio = 16;
                        baseDigit = 1;
                        return "retardedly-high";
                    }
                })();
                return this.generatePrimarySpecifications(object) + 1 + Math.ceil(object.str.length / compressionRatio) + object.uniqueCharacters.length + 1;
            },
            readContentFunction(buffer, specification) {
                console.debugDetailed(`ENGSTRING by THEJADES. SPEC.v1 in read mode`);
                let secondarySpecificationsResults = JadeStruct.secondarySpecificationOperations.read(buffer, specification);
                let currentReadPointer = secondarySpecificationsResults.ReadLength;
                let stringLength = secondarySpecificationsResults.Data;

                let string = "";

                let characterMapping: string[] = [];

                for (let i = 0;i<16;i++){
                    let readByte = buffer.readUInt8(currentReadPointer ++);

                    if (readByte == 0)
                        break;

                    characterMapping.push(String.fromCharCode(readByte));
                }

                let compressionRatio = 0;
                let baseDigit = 0;
                let compressionMode = (()=>{
                    if (characterMapping.length > 6){
                        compressionRatio = 2;
                        baseDigit = 16;
                        return "low";
                    }else if (characterMapping.length > 4){
                        compressionRatio = 3;
                        baseDigit = 6;
                        return "medium";
                    }else if (characterMapping.length > 2){
                        compressionRatio = 4;
                        baseDigit = 4;
                        return "high";
                    }else if (characterMapping.length > 1){
                        compressionRatio = 8;
                        baseDigit = 2;
                        return "extremely-high";
                    }else{
                        compressionRatio = 16;
                        baseDigit = 1;
                        return "retardedly-high";
                    }
                })();

                console.debugDetailed(`ENGSTRING determined the compression capacity to be ${compressionMode}`);
                console.debugDetailed(`ENGSTRING has the compatible compression ratio of ${compressionRatio} and a basedigit of ${baseDigit}`);

                let compressedByteLength = Math.ceil(stringLength / compressionRatio);

                for (let i = 0;i<compressedByteLength;i++){
                    let readByte = buffer.readUInt8(currentReadPointer ++);

                    for (let r = 0;r<compressionRatio;r++){
                        string += characterMapping[Math.floor(readByte / Math.pow(baseDigit, r) % baseDigit)];
                    }


                }

                string = string.substring(0, stringLength);

                return {Data: string, ReadLength: currentReadPointer};
            },
            writeContentFunction(buffer, object: {
                str: string,
                uniqueCharacters: number[]
            }) {
                console.debugDetailed(`ENGSTRING by THEJADES. SPEC.v1 in write mode`);
                let specificationBytesWritten = JadeStruct.secondarySpecificationOperations.write(buffer, this.specificationSize, this.generateSecondarySpecifications!(object));
                let currentWriteHead = specificationBytesWritten;

                let characterMapping = new Map<string, number>();

                let i = 0;
                for (let uniqueCharacter of object.uniqueCharacters){
                    buffer.writeUInt8(uniqueCharacter, currentWriteHead ++);
                    characterMapping.set(String.fromCharCode(uniqueCharacter), i++);
                }
                buffer.writeUInt8(0, currentWriteHead ++);

                let compressionRatio = 0;
                let baseDigit = 0;
                let compressionMode = (()=>{
                    if (object.uniqueCharacters.length > 6){
                        compressionRatio = 2;
                        baseDigit = 16;
                        return "low";
                    }else if (object.uniqueCharacters.length > 4){
                        compressionRatio = 3;
                        baseDigit = 6;
                        return "medium";
                    }else if (object.uniqueCharacters.length > 2){
                        compressionRatio = 4;
                        baseDigit = 4;
                        return "high";
                    }else if (object.uniqueCharacters.length > 1){
                        compressionRatio = 8;
                        baseDigit = 2;
                        return "extremely-high";
                    }else{
                        compressionRatio = 16;
                        baseDigit = 1;
                        return "retardedly-high";
                    }
                })();

                console.debugDetailed(`ENGSTRING determined the compression capacity to be ${compressionMode}`);
                console.debugDetailed(`ENGSTRING has the compatible compression ratio of ${compressionRatio} and a basedigit of ${baseDigit}`);

                console.debugDetailed(`NEW ENGSTRING LENGTH: ${Math.ceil(object.str.length / compressionRatio)}`);

                for (let i = 0;i<object.str.length;i+=compressionRatio){
                    let multiCharacterByte = 0;

                    for (let r = 0;r<compressionRatio;r++)
                        multiCharacterByte += characterMapping.get(object.str[i + r] || object.str[0])! * Math.pow(baseDigit, r);

                    buffer.writeUInt8(multiCharacterByte, currentWriteHead ++);
                }

                return currentWriteHead;
            },
        },{
            specificationName: "Function",
            specificationSize: 6,
            generateSecondarySpecifications(object: string) {
                return supportedBufferClass.from(object, "utf-8").byteLength;
            },
            generatePrimarySpecifications(object: string) {
                return JadeStruct.secondarySpecificationOperations.generate(this.specificationSize, this.generateSecondarySpecifications!(object));
            },
            getDynamicSize(object: string){
                return this.generatePrimarySpecifications(object) + 1 + supportedBufferClass.from(object, "utf-8").byteLength;
            },
            readContentFunction(buffer, specification) {
                let secondarySpecificationsResults = JadeStruct.secondarySpecificationOperations.read(buffer, specification);
                let currentReadPointer = secondarySpecificationsResults.ReadLength;
                let stringLength = secondarySpecificationsResults.Data;
                let string = buffer.subarray(currentReadPointer, currentReadPointer + stringLength).toString("utf-8")
                return {Data: new Function(string)(), ReadLength: stringLength + currentReadPointer};
            },
            writeContentFunction(buffer, object: string) {
                let specificationBytesWritten = JadeStruct.secondarySpecificationOperations.write(buffer, this.specificationSize, this.generateSecondarySpecifications!(object));
                return specificationBytesWritten + buffer.write(object, specificationBytesWritten, "utf-8");
            },
        },
        {
            specificationName: "Map",
            specificationSize: 6,
            generateSecondarySpecifications(objects: JadeStructBlueprint[]){
                return objects.length;
            },
            generatePrimarySpecifications(objects: JadeStructBlueprint[]) {
                return JadeStruct.secondarySpecificationOperations.generate(this.specificationSize, this.generateSecondarySpecifications!(objects));
            },
            getDynamicSize(objects: JadeStructBlueprint[]){
                return this.generatePrimarySpecifications(objects) + 1;
            },
            readContentFunction(buffer, specification) {
                let secondarySpecificationsResults = JadeStruct.secondarySpecificationOperations.read(buffer, specification);
                let arrayLength = secondarySpecificationsResults.Data;
                let currentReadPointer = secondarySpecificationsResults.ReadLength;
                let object = new Map<any, any>();

                for (let i = 0;i<arrayLength;i+=2){
                    let keyReadResults = JadeStruct.readJadeStruct(buffer.subarray(currentReadPointer));
                    currentReadPointer += keyReadResults.ReadPointer;
                    let valueReadResults = JadeStruct.readJadeStruct(buffer.subarray(currentReadPointer));
                    currentReadPointer += valueReadResults.ReadPointer;
                    object.set(keyReadResults.Data, valueReadResults.Data);
                }

                // console.log(arrayLength);
                return {Data: object, ReadLength: currentReadPointer};
            },
            writeContentFunction(buffer, objects: JadeStructBlueprint[]) {
                return JadeStruct.secondarySpecificationOperations.write(buffer, this.specificationSize, this.generateSecondarySpecifications!(objects));
            },
        },
        {
            specificationName: "EmptyValue",
            specificationSize: 3,
            generatePrimarySpecifications(object: null | undefined | typeof Number.NaN) {
                if (Number.isNaN(object)){
                    return 0;
                }
                if (object === null){
                    return 1;
                }
                return 2;
            },
            getDynamicSize(objects: JadeStructBlueprint[]){
                return 0;
            },
            readContentFunction(buffer, specification) {
                let outputData;
                switch(specification){
                    case 0:{
                        outputData = Number.NaN;
                        break;
                    }
                    case 1:{
                        outputData = null;
                        break;
                    }
                    default:{
                        outputData = undefined;
                    }
                }
                // console.log(arrayLength);
                return {Data: outputData, ReadLength: 0};
            },
            writeContentFunction(buffer, objects: JadeStructBlueprint[]) {
                return 0;
            },
        },
        {
            specificationName: "Boolean",
            specificationSize: 2,
            generatePrimarySpecifications(object: boolean) {
                return object ? 0 : 1;
            },
            getDynamicSize(objects: JadeStructBlueprint[]){
                return 0;
            },
            readContentFunction(buffer, specification) {
                return {Data: specification == 0, ReadLength: 0};
            },
            writeContentFunction(buffer, objects: JadeStructBlueprint[]) {
                return 0;
            },
        },
        {
            specificationName: "Buffer",
            specificationSize: 6,
            generateSecondarySpecifications(object: typeof supportedBufferClass.prototype) {
                return object.length;
            },
            generatePrimarySpecifications(object: typeof supportedBufferClass.prototype) {
                return JadeStruct.secondarySpecificationOperations.generate(this.specificationSize, this.generateSecondarySpecifications!(object));
            },
            getDynamicSize(object: typeof supportedBufferClass.prototype){
                return this.generatePrimarySpecifications(object) + 1 + object.length;
            },
            readContentFunction(buffer, specification) {
                let secondarySpecificationsResults = JadeStruct.secondarySpecificationOperations.read(buffer, specification);
                let currentReadPointer = secondarySpecificationsResults.ReadLength;
                let stringLength = secondarySpecificationsResults.Data;
                return {Data: buffer.subarray(currentReadPointer, currentReadPointer + stringLength), ReadLength: stringLength + currentReadPointer};
            },
            writeContentFunction(buffer, object: typeof supportedBufferClass.prototype) {
                let specificationBytesWritten = JadeStruct.secondarySpecificationOperations.write(buffer, this.specificationSize, this.generateSecondarySpecifications!(object))
                return specificationBytesWritten + buffer.write(object.toString("binary"), specificationBytesWritten, "binary");
            },
        },
    ]


    private static secondarySpecificationOperations = {
        write(buffer: typeof supportedBufferClass.prototype, maximumPrimarySpecification: number,  secondarySpecification: number){
            return buffer.writeUIntBE(secondarySpecification, 0, this.generate(maximumPrimarySpecification, secondarySpecification) + 1);
        },
        read(buffer: typeof supportedBufferClass.prototype, primarySpecification: number){
            return {Data: buffer.readUIntBE(0, primarySpecification + 1), ReadLength: primarySpecification + 1};
        },
        generate(maximumPrimarySpecification: number, secondarySpecification: number){
            let primarySpecification = Math.max(0, Math.ceil(Math.log(secondarySpecification)/Math.log(255)) - 1);
            console.debugDetailed(`Generated the secondary specification for ${secondarySpecification} with a primary specification of ${primarySpecification}`);
        
            if (primarySpecification >= maximumPrimarySpecification){
                throw new Error("Failure to write a larger secondary specification. Exceding maximum primary specifications!");
            }

            return primarySpecification;
        },
    };

    private static supportedDataTypePositions: number[] = (()=>{
        let positions: number[] = [];
        let currentPositions = 0;

        for (let dataType of this.supportedDataType){
            positions.push(currentPositions);
            currentPositions += dataType.specificationSize;
        }

        return positions;
    })();


    private static mappedDataTypes = (()=>{
        let map = new Map<string, number>();

        let i = 0;
        for (let dataType of JadeStruct.supportedDataType){
            map.set(dataType.specificationName, i);
            i += 1;
        }

        return map;
    })();


    private static generateBlueprint(object: any, blueprints: JadeStructBlueprint[] = []){
        let jadeStructIndividualBlueprint: JadeStructBlueprint = {
            dataHeaderType: 0,
            dataHeaderPrimarySpecs: 0,
            dataContentLength: 0,
            parasableObject: null,
        }

        blueprints.push(jadeStructIndividualBlueprint);

        if ((object == null && object !== 0) || Number.isNaN(object)){
            jadeStructIndividualBlueprint.dataHeaderType = JadeStruct.mappedDataTypes.get("EmptyValue")!;
            jadeStructIndividualBlueprint.parasableObject = object;
        }else
            switch(Object.getPrototypeOf(object)){
                case Date.prototype:{
                    jadeStructIndividualBlueprint.dataHeaderType = JadeStruct.mappedDataTypes.get("Date")!;
                    jadeStructIndividualBlueprint.parasableObject = object;
                    break;
                }
                case Number.prototype:{
                    if (Number.isInteger(object)){
                        jadeStructIndividualBlueprint.dataHeaderType = object as number < 0 ? JadeStruct.mappedDataTypes.get("Neg-Int")! : JadeStruct.mappedDataTypes.get("Pos-Int")!;
                    }else{
                        jadeStructIndividualBlueprint.dataHeaderType = JadeStruct.mappedDataTypes.get("Double")!;
                    }
                    jadeStructIndividualBlueprint.parasableObject = object;
                    break;
                }
                case Array.prototype:{
                    jadeStructIndividualBlueprint.dataHeaderType = JadeStruct.mappedDataTypes.get("Array")!;
                    
                    let array = object as Array<any>;
                    
                    let jadeBlueprintSpecificObjects: JadeStructBlueprint[] = [];
                    
                    for (let i = 0;i<array.length;i++){
                        jadeBlueprintSpecificObjects.push(this.generateBlueprint(array[i], blueprints).ObjectSpecificBlueprint);
                    }
                    
                    jadeStructIndividualBlueprint.parasableObject = jadeBlueprintSpecificObjects;
                    
                    break;
                }
                case String.prototype:{

                    jadeStructIndividualBlueprint.dataHeaderType = JadeStruct.mappedDataTypes.get("String")!;
                    jadeStructIndividualBlueprint.parasableObject = object;
                    // Disabled EngString due to performance loss for unneccessary string compression
                    // let charaters = new Map<number, number>();
                    // let str = object as string;

                    // let engStringCompression = true;

                    // for (let i = 0;i<str.length;i++){
                    //     let charCode = str.charCodeAt(i);

                    //     if (charCode >= 32 && charCode <= 126){
                    //         if (charaters.has(charCode) == false)
                    //             charaters.set(charCode, charaters.size);
                    //     }else{
                    //         engStringCompression = false;
                    //         break;
                    //     }
                    //     if (charaters.size >= 16){
                    //         engStringCompression = false;
                    //         break;
                    //     }
                    // }

                    // if (engStringCompression){
                    //     jadeStructIndividualBlueprint.dataHeaderType = JadeStruct.mappedDataTypes.get("EngString")!;
                    //     let uniqueCharacters: number[] = [];

                    //     for (let characterCode of charaters){
                    //         uniqueCharacters[characterCode[1]] = characterCode[0];
                    //     }

                    //     jadeStructIndividualBlueprint.parasableObject = {
                    //         str,
                    //         uniqueCharacters    
                    //     };
                    // }else{
                    //     jadeStructIndividualBlueprint.dataHeaderType = JadeStruct.mappedDataTypes.get("String")!;
                    //     jadeStructIndividualBlueprint.parasableObject = object;
                    // }
                    break;
                }
                case Function.prototype:{
                    jadeStructIndividualBlueprint.dataHeaderType = JadeStruct.mappedDataTypes.get("Function")!;
                    if (`${object}`.match(/^.+ \[native code\] /)){
                        let functionName = (`${object}`.match(/^function (\w[_\d\w$]*)\(/) || ["", "null"])[1];
                        console.error("Cannot stringify a JavaScript function that is natively compiled into the program.");
                        console.warn(`Created the function property anyways. It would output an unparasable function error. The function in question is: ${functionName}`);

                        jadeStructIndividualBlueprint.parasableObject = `return ()=>{throw new Error("This unparasable function cannot be ran.")}`;

                        break;
                    }
                    jadeStructIndividualBlueprint.parasableObject = `return ${object}`;
                    break;
                }
                case Map.prototype:{
                    jadeStructIndividualBlueprint.dataHeaderType = JadeStruct.mappedDataTypes.get("Map")!;

                    let jadeBlueprintSpecificObjects: JadeStructBlueprint[] = [];
                    let map = object as Map<any, any>;

                    for (let key of map.keys()){
                        jadeBlueprintSpecificObjects.push(this.generateBlueprint(key, blueprints).ObjectSpecificBlueprint);
                        jadeBlueprintSpecificObjects.push(this.generateBlueprint(map.get(key), blueprints).ObjectSpecificBlueprint);
                    }

                    jadeStructIndividualBlueprint.parasableObject = jadeBlueprintSpecificObjects;
                    break;
                }
                case Boolean.prototype:{
                    jadeStructIndividualBlueprint.dataHeaderType = JadeStruct.mappedDataTypes.get("Boolean")!;
                    jadeStructIndividualBlueprint.parasableObject = object;
                    break;
                }
                case supportedBufferClass.prototype:{
                    jadeStructIndividualBlueprint.dataHeaderType = JadeStruct.mappedDataTypes.get("Buffer")!;
                    jadeStructIndividualBlueprint.parasableObject = object;
                    break;
                }
                default:{
                    jadeStructIndividualBlueprint.dataHeaderType = JadeStruct.mappedDataTypes.get("Object")!;

                    let jadeBlueprintSpecificObjects: JadeStructBlueprint[] = [];

                    for (let key in object){
                        jadeBlueprintSpecificObjects.push(this.generateBlueprint(key, blueprints).ObjectSpecificBlueprint);
                        jadeBlueprintSpecificObjects.push(this.generateBlueprint(object[key], blueprints).ObjectSpecificBlueprint);
                    }

                    jadeStructIndividualBlueprint.parasableObject = jadeBlueprintSpecificObjects;

                    break;
                }
            }


        let jadeStructDataType = JadeStruct.supportedDataType[jadeStructIndividualBlueprint.dataHeaderType];

        console.debugDetailed(`Made the JadeStruct Blueprint for a ${jadeStructDataType.specificationName}!`);

        let parsedObject = jadeStructIndividualBlueprint.parasableObject;

        jadeStructIndividualBlueprint.dataHeaderPrimarySpecs = JadeStruct.supportedDataType[jadeStructIndividualBlueprint.dataHeaderType].generatePrimarySpecifications(parsedObject);
        jadeStructIndividualBlueprint.dataContentLength = JadeStruct.supportedDataType[jadeStructIndividualBlueprint.dataHeaderType].getDynamicSize(parsedObject) + 1;

        return {
            Blueprints: blueprints,
            ObjectSpecificBlueprint: jadeStructIndividualBlueprint
        };
    }

    public static toJadeStruct(object: any){

        console.debugDetailed(`DataType Track: ${JadeStruct.supportedDataTypePositions}`)

        console.debugDetailed("Generating JadeStruct BluePrint...");
        
        let dataBlueprintResults = JadeStruct.generateBlueprint(object);
        let dataBlueprint = dataBlueprintResults.Blueprints;

        console.debugDetailed("Constructing JadeStruct from Blueprint...");

        let totalSize = 0;

        for (let blueprint of dataBlueprint){
            totalSize += blueprint.dataContentLength;
        }

        let writePointer = 0;
        let jadeStructBuffer = Buffer_JADEPORTED.alloc(totalSize);

        for (let blueprint of dataBlueprint){

            let jadeStructDataType = JadeStruct.supportedDataType[blueprint.dataHeaderType];

            if (blueprint.dataHeaderPrimarySpecs >= jadeStructDataType.specificationSize){
                throw new Error("Failure to stringify JadeStruct. Too large primary specs for the specified maximum primary specs.");
            }

            console.debugDetailed(`Constructing ${jadeStructDataType.specificationName}... of size ${blueprint.dataContentLength} with primary specs of ${blueprint.dataHeaderPrimarySpecs}`);
            writePointer = jadeStructBuffer.writeUInt8(JadeStruct.supportedDataTypePositions[blueprint.dataHeaderType] + blueprint.dataHeaderPrimarySpecs, writePointer);
            writePointer += jadeStructDataType.writeContentFunction(jadeStructBuffer.subarray(writePointer), blueprint.parasableObject);
        }

        return jadeStructBuffer;
    }

    private static readJadeStruct(buffer: typeof supportedBufferClass.prototype){

        let readPointer = 0;

        let headerTypePrimSpecs = buffer.readUInt8(readPointer);
        readPointer += 1; 

        let dataType: JadeStructDataType | null = null;
        let primarySpecifications = 0;

        for (let i = 0;i<JadeStruct.supportedDataType.length;i++){
            let currentPosition = JadeStruct.supportedDataTypePositions[i];
            let currentEndingPosition = currentPosition + JadeStruct.supportedDataType[i].specificationSize;

            if (headerTypePrimSpecs >= currentPosition && headerTypePrimSpecs < currentEndingPosition){
                dataType = JadeStruct.supportedDataType[i];
                primarySpecifications = headerTypePrimSpecs - currentPosition;
                break;
            }
        }

        if (dataType == null){
            throw new Error("Failure to parse JadeStruct. An unidentified and unsupported data type was reached.");
        }

        console.debugDetailed(`Determined the JadeStruct to be ${dataType.specificationName}. Primary Specifications: ${primarySpecifications}`);
        let readResult = dataType.readContentFunction(buffer.subarray(readPointer), primarySpecifications);
        readPointer += readResult.ReadLength;

        console.debugDetailed(`Deconstructed JadeStruct!`);

        return {
            Data: readResult.Data,
            ReadPointer: readPointer
        };
    }

    public static toObject(jadeStruct: string | Buffer_JADEPORTED | Buffer){
        if (typeof jadeStruct == "string"){
            return JadeStruct.readJadeStruct(supportedBufferClass.from(jadeStruct, "binary")).Data;
        }else{
            return JadeStruct.readJadeStruct(jadeStruct).Data;
        }
    }   
}
