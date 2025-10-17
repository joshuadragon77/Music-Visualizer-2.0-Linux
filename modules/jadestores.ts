/**
 * JadesTS-JS MODULES >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
 * -----------------------------------------------------
 * JADESTORES.TS
 * -----------------------------------------------------
 * 
 * Author: Joshua Null (TheJades)
 * 
 * what is it about
 * 
 *  ⚬ provides a way to store data and load them back using block data storage
 * 
 * 
 * heve fun
 */

/**
 */

import * as console from "./consolescript.js";

import * as FileSystem from "fs/promises";
import * as FileSystemS from "fs";
import * as Crypto from "crypto";

let diskActivity = {
    read: 0,
    write: 0,
    timeSinceMeasured: Date.now()
}

// let a = setInterval(()=>{
//     console.log(`READ: ${nearByteConversion(diskActivity.read)}`);
//     console.log(`WRITE: ${nearByteConversion(diskActivity.write)}`);
//     diskActivity.read = 0;
//     diskActivity.write = 0;
// }, 1000);

function nearByteConversion(bytes: number){
    if (bytes > 1000){
        bytes /= 1000
        if (bytes > 1000){
            bytes /= 1000
            if (bytes > 1000){
                return `${Math.round(bytes)} gigabytes`
            }
            return `${Math.round(bytes)} megabytes`
        }
        return `${Math.round(bytes)} kilobytes`
    }
    return `${Math.round(bytes)} bytes`;
}

class BufferOperations{
    static add(buffer1: Buffer, buffer2: Buffer){
        let newBuffer = Buffer.alloc(buffer1.length + buffer2.length);
        
        newBuffer.write(buffer1.toString("binary"), "binary");
        newBuffer.write(buffer2.toString("binary"), buffer1.length, "binary");
        
        return newBuffer;
    }
    
    static toBuffer(string: string){
        let buffer = Buffer.alloc(string.length);
        buffer.write(string);
        return buffer;
    }
}

type EPointers = {
    position: number,
    size: number,
    index: number | null,
    type: number
}

let openedLowLevelJadeDB: LowLevelJadeDB[] = [];

type WriteDataArgs = {
    buffer: Buffer
    index: number
    dataName: string
    dataType: number
}

export class LowLevelJadeDB{

    private blockSize: number;
    private encryptionKey: Buffer | null = null;
    
    filePath = "";
    fileHandler: FileSystem.FileHandle | null = null;
    
    ePointers: EPointers[] = [];
    ePointersIndex: EPointers[] = [];
    writeDataQueueList: WriteDataArgs[] = [];
    writingData = false;
    internalFlushCallback: (() => (void)) | undefined;
    
    constructor(fileName: string, blockSize: number = 8192, password?: string){
        if (blockSize <= 192 + 16){
            throw new Error("Cannot to create a JadeDB with a block size less than or equal to 208 bytes.");
        }
        this.filePath = fileName;
        this.blockSize = blockSize;
        
        if (password){
            this.encryptionKey = Crypto.scryptSync(password, "salt", 32);
        }
    }
    
    setEncryptionKey(password: string | null){
        if (password){
            this.encryptionKey = Crypto.scryptSync(password, "salt", 32);
        }else{
            this.encryptionKey = null
        }
    }

    exists(blockLocation: number){
        return new Promise<boolean>((accept, reject)=>{
            console.debugDetailed(`Sending an Exist Request to Block location ${blockLocation}`);
            if (this.fileHandler == null){
                reject("This DataBase has not been opened!");
                return;
            }

            let rawBuffer = Buffer.alloc(this.blockSize);

            this.fileHandler.read(rawBuffer, 0, this.blockSize, this.blockSize * blockLocation + 10).then(results=>{
                accept(results.bytesRead == this.blockSize);
            }).catch(reject);
        });
    }

    copy(blockLocation: number, newBlockLocation: number){
        return new Promise((accept, reject)=>{
            console.debugDetailed(`Sending an Copy Request from Block location ${blockLocation} to ${newBlockLocation}`);
            if (this.fileHandler == null){
                reject("This DataBase has not been opened!");
                return;
            }

            let rawBuffer = Buffer.alloc(this.blockSize);

            this.fileHandler.read(rawBuffer, 0, this.blockSize, this.blockSize * blockLocation + 10).then(results=>{
                console.debugDetailed(`Read the entire block contents of ${blockLocation}`);

                console.debugDetailed(`Pre-writing EPointers to this specific block location ${newBlockLocation}`);
                let startingEPointerIndex = newBlockLocation * 3;

                // first fix?
                for (let index = startingEPointerIndex;index<startingEPointerIndex+3;index++){

                    let ePointerBuffer = Buffer.alloc(7);
                    let ePointerIndex = index % 3;

                    if (index < this.ePointers.length){
                        let ePointer = this.ePointers[index];
    
                        if (!ePointer){
                            ePointer = {
                                position: index,
                                index: null,
                                type: 1,
                                size: 1
                            }
                        }
    
    
                        ePointerBuffer.writeUIntBE(ePointer.type, 0, 1);
                        ePointerBuffer.writeUIntBE(ePointer.index !== null ? ePointer.index + 1 : 0, 1, 3);
                        ePointerBuffer.writeUIntBE(ePointer.size, 4, 3);
    
                    }


                    results.buffer.write(ePointerBuffer.toString("binary"), 43 + ePointerIndex * 7, "binary");
                }

                console.debugDetailed(`Copying the block content to ${newBlockLocation} from ${blockLocation}`);
                this.fileHandler!.write(results.buffer, 0, this.blockSize, this.blockSize * newBlockLocation + 10).then(accept).catch(reject);
            }).catch(reject);
        });
    }

    read(blockLocation: number){
        return new Promise<{
            BlockName: string,
            BlockType: number,
            OutputBuffer: Buffer,
            VerifiedCheckSum: boolean,
            Terminal: boolean,
            BIndex: number
        }>((accept, reject)=>{

            console.debugDetailed(`Sending a Read Request at Block Location ${blockLocation}`);
            if (this.fileHandler == null){
                reject("This DataBase has not been opened!");
                return;
            }

            let rawBuffer = Buffer.alloc(this.blockSize);

            this.fileHandler.read(rawBuffer, 0, this.blockSize, this.blockSize * blockLocation + 10).then(results=>{

                if (results.bytesRead == 0){
                    reject("There is no data in this block location!");
                    return;
                }

                diskActivity.read += results.bytesRead;

                console.debugDetailed(`Reading the headers at Block Location ${blockLocation}`);

                let header = results.buffer.subarray(0, 192);

                let blockName = header.subarray(0, 32);
                let blockType = header.subarray(32, 40).readUInt8(0);
                let bindex = header.subarray(40, 43).readIntBE(0, 3);
                let terminal = bindex < 0;
                bindex = Math.abs(bindex) - 1;
                let checkSumValue = header.subarray(64, 128).toString("binary");
                let bufferLength = header.subarray(128, 128 + 5).readUIntBE(0, 5);
                let initializationVector = header.subarray(133, 149);

                console.debugDetailed(`Determined the BIndex to be ${bindex} and is terminal=${terminal}`);
                console.debugDetailed(`Determined the size of the block's content to be ${bufferLength}`);

                if (bufferLength > this.blockSize){
                    console.warn("The block read is in an invalid state. The stored data supposedly is bigger than the block size?");
                    bufferLength = this.blockSize - 192;
                }

                let buffer = results.buffer.subarray(192, 192 + bufferLength);

                let shaHashAlgorithm = Crypto.createHash("sha512");
                shaHashAlgorithm.update(buffer);
                let shaSumResults = shaHashAlgorithm.digest();
                
                let outputBuffer = Buffer.alloc(bufferLength);
                outputBuffer.write(buffer.toString("binary"), "binary");

                let verifiedChkSum = shaSumResults.toString("binary") == checkSumValue;

                console.debugDetailed(`Found the checksum. Verifying the block's content...`);

                if (verifiedChkSum == false){
                    console.warn("The checksum algorithm has failed to verify the data integrity. Data corruption is possible.");
                }

                let isEncrypted = (()=>{
                    let empty = true;
                    for (let i = 0;i<16;i++){
                        empty = 0 == initializationVector.at(i);
                        if (empty == false)
                            break;
                    }
                    return empty != true;
                })();

                if (isEncrypted){
                    console.debugDetailed(`The Header indicates that the contents may be encrypted. Prompting and using the Decryption Key...`);
                }

                if (this.encryptionKey && isEncrypted){
                    let decipher = Crypto.createDecipheriv("aes-256-cbc", this.encryptionKey, initializationVector);
                    let decipherName = Crypto.createDecipheriv("aes-256-cbc", this.encryptionKey, initializationVector);
                    console.debugDetailed(`Decrypting the blockname and blockdata`);

                    try{
                        blockName = BufferOperations.add(decipherName.update(blockName), decipherName.final());
                        outputBuffer = BufferOperations.add(decipher.update(outputBuffer), decipher.final());
                    }
                    catch(er){
                        reject("Failed to decrypt the data. Incorrect Password.");
                        return;
                    }
                }else
                    if (isEncrypted && this.encryptionKey == null){
                        console.warn("You just read encrypted data. This data needs a password to be used.");
                    }else if (isEncrypted == false && this.encryptionKey){
                        console.warn("A password is not neccessary to read unencrypted data.");
                    }

                accept({
                    BlockName: blockName.toString("ascii"),
                    BlockType: blockType,
                    OutputBuffer: outputBuffer,
                    VerifiedCheckSum: verifiedChkSum,
                    Terminal: terminal,
                    BIndex: bindex
                });

            }).catch(reject);
        });
    }

    

    write(blockLocation: number, buffer: Buffer, blockName: string = "", blockType: number = 1, beindx = 1, terminal = true){
        return new Promise<void>((accept, reject)=>{
            console.debugDetailed(`Sending a Write Request... of Block Location ${blockLocation}, blockName ${blockName} and blockType ${blockType}`);

            if (this.fileHandler == null){
                reject("This DataBase has not been opened!");
                return;
            }
            if (beindx < 0){
                reject("BEIndex cannot be less than zero.");
                return;
            }

            blockName = blockName.substring(0, 31);
            blockName += "\0".repeat(31 - blockName.length);

            let write = (buffer: Buffer, blockName: string, initializationVector: Buffer | null)=>{

                // if (initializationVector){
                //     if (buffer.length > this.blockSize - 192 - 16){
                //         console.warn(`You are writing a block with no room for 16 additional bytes for your allocated ${this.blockSize - 192} for encryption. Data loss may be possible and decryption may fail.`);
                //     }
                // }
                let ingressBuffer = Buffer.alloc(this.blockSize);
    
                let shaHashAlgorithm = Crypto.createHash("sha512");
                shaHashAlgorithm.update(buffer);
                let shaSumResults = shaHashAlgorithm.digest();
                ingressBuffer.write(blockName, "binary");
                ingressBuffer.writeUInt8(blockType, 32);
                ingressBuffer.writeIntBE((beindx + 1) * (terminal ? -1 : 1), 40, 3);
                {
                    console.debugDetailed(`Pre-writing EPointers to this specific block location ${blockLocation}`);
                    let startingEPointerIndex = blockLocation * 3;
                    for (let index = startingEPointerIndex;index<Math.min(this.ePointers.length, startingEPointerIndex+3);index++){
                        let ePointer = this.ePointers[index];
    
                        if (!ePointer){
                            ePointer = {
                                position: index,
                                index: null,
                                type: 1,
                                size: 1
                            }
                        }
    
                        let ePointerBuffer = Buffer.alloc(7);
    
                        ePointerBuffer.writeUIntBE(ePointer.type, 0, 1);
                        ePointerBuffer.writeUIntBE(ePointer.index !== null ? ePointer.index + 1 : 0, 1, 3);
                        ePointerBuffer.writeUIntBE(ePointer.size, 4, 3);
    
                        let ePointerIndex = index % 3;

                        ingressBuffer.write(ePointerBuffer.toString("binary"), 43 + ePointerIndex * 7, "binary");
                    }
                }
                
                ingressBuffer.write(shaSumResults.toString("binary"), 64, "binary");
                ingressBuffer.writeUIntBE(buffer.length, 128, 5);
                if (initializationVector)
                    ingressBuffer.write(initializationVector.toString("binary"), 133, "binary");
                
                ingressBuffer.write(buffer.toString("binary"), 192, "binary");

                console.debugDetailed(`Writing to disk...`);
                this.fileHandler!.write(ingressBuffer, 0, this.blockSize, this.blockSize * blockLocation  + 10).then(results=>{
                    diskActivity.write += results.bytesWritten;
                    accept();
                }).catch(reject);
            }

            if (this.encryptionKey){

                let initializationVector = Buffer.alloc(16);

                Crypto.randomFill(initializationVector, ()=>{
                    let cipher = Crypto.createCipheriv("aes-256-cbc", this.encryptionKey!, initializationVector);
                    
                    let encryptedBuffer = BufferOperations.add(cipher.update(buffer), cipher.final());
                    
                    let cipherName = Crypto.createCipheriv("aes-256-cbc", this.encryptionKey!, initializationVector);

                    let encryptedName = BufferOperations.add(cipherName.update(blockName), cipherName.final()).toString("binary");
                    
                    console.debugDetailed(`Encrypted the block ${blockLocation}`);
                    write(encryptedBuffer, encryptedName, initializationVector);
                })


            }else{
                write(buffer, blockName, null);
            }
        });
    }

    locateEmptyBlocks(minimumSpace: number, startPosition: number = 0, ignoreConditions?: (ePointer: EPointers)=>(boolean)): EPointers{
        console.debugDetailed(`Searching for empty blocks with a minimum requirement of ${minimumSpace}, starting at ${startPosition}`);
        let ePointers = this.ePointers;
        let reservedSpace: number | null = null;
        let lastEmpty: number | null = null;

        for (let i = 0;i<ePointers.length;i++){
            let ePointer = ePointers[i] as EPointers | undefined;

            if (ePointer){
                if (ignoreConditions && ignoreConditions(ePointer)){
                    continue;
                }
                lastEmpty = null;
                reservedSpace = null;
                switch(ePointer.type){
                    case 0:{
                        lastEmpty = ePointer.position;
                        if (ePointer.size >= minimumSpace && startPosition <= i){
                            return ePointer;
                        }
                        break;
                    }
                    case 2:{
                        reservedSpace = ePointer.size + ePointer.position;
                        break;
                    }
                }
            }
        }


        if (lastEmpty){
            console.debugDetailed(`Found such requirements at ${lastEmpty}`);
            return {
                index: null,
                position: lastEmpty,
                type: 0,
                size: -1
            }
        }else{
            console.debugDetailed(`Found such requirements at ${reservedSpace ? reservedSpace : ePointers.length}`);
            return {
                index: null,
                position: reservedSpace ? reservedSpace : ePointers.length,
                type: 0,
                size: -1
            };
        }
    }

    readData(index: number){
        return new Promise<{
            DataName: string,
            DataType: number,
            Buffer: Buffer
        }>((accept, reject)=>{
            let blockLocation = this.getEPointerFromIndex(index);

            console.debugDetailed(`Preparing to read data...`);
            if (blockLocation){
                if (blockLocation.type != 2){
                    return reject(`The Index ${index} is not a readable block.`);
                }
                console.debugDetailed(`Located blocks!`);

                let dataSizeClearance = this.blockSize - 192 - 16;

                let compiledBufferArry = Buffer.alloc(blockLocation.size * dataSizeClearance);
                let completedTask = 0;
                let actualDataSize = 0;

                let dataName = "";
                let dataType = 0;
                let terminalReached = false;
                let expectedLength = blockLocation!.size;

                let completeTask = (dataBlock: Buffer, bindex: number)=>{
                    actualDataSize += dataBlock.length;
                    compiledBufferArry.write(dataBlock.toString('binary'), bindex * dataSizeClearance, "binary");

                    if (completedTask == expectedLength){
                        console.debugDetailed(`Completed Read Task`);

                        console.debugDetailed(`Finished Building the Data`);
                        accept({
                            DataName: dataName.replace(/\0.+/, ""),
                            DataType: dataType,
                            Buffer: compiledBufferArry.subarray(0, actualDataSize)
                        })
                    }
                };

                let addReadTask = (position: number, index: number | undefined)=>{
                    this.read(position).then(data=>{
                        if (data.VerifiedCheckSum == false){
                            console.warn(`Checksum failed. Data Corruption is possible at block ${position} and index ${index || "\"errored\""}`);
                        }
                        // stupid ass conditioning. why the fuck do you want this? breaks unneccessarily and for what? commented because i have no fucking clue what it serves.
                        // if (data.Terminal == false && completedTask + 1 == expectedLength){
                        //     console.warn(`EPointers specify a data size inconsistent with BIndex and Terminality. It is most likely the data has been written incompletely.`);
                        //     throw new Error("Cannot continue read with a contradiction between EPointers and BIndex/Terminality. Database must be repaired.")
                        // }
                        dataName = data.BlockName;
                        dataType = data.BlockType;
                        console.debugDetailed(`Finished reading BIndex: ${data.BIndex}`);
                        completedTask += 1;
                        completeTask(data.OutputBuffer, data.BIndex);
                    }).catch((err)=>{
                        console.error(`Critical error when reading block ${position} index ${index || "\"errored\""}: ${err}`);
                        reject(err);
                    });
                }

                for (let i = 0;i<blockLocation.size;i++){
                    console.debugDetailed(`Sending Read Request...`);
                    addReadTask(blockLocation.position + i, i);
                }
            }else{
                return reject(`Cannot determine the location of index ${index}`);
            }
        });
    }

    getArrayLength(){
        let items = 0;

        for (let ePointer of this.ePointersIndex){
            if (ePointer && ePointer.type == 2){
                items += 1;
            }
        }
        
        return items;
    }

    getByteLength(){
        let bytes = 0;

        for (let ePointer of this.ePointers){
            bytes += ePointer.size * this.blockSize;
        }
        
        return bytes;
    }

    writeDataQueue(buffer: Buffer, index: number, dataName: string = "Unnamed", dataType: number = 0){
        console.debugDetailed(`Queued ${dataName} for data write at index ${index}`);
        this.writeDataQueueList.push({
            buffer, index, dataName, dataType
        });

        if (this.writingData == false){
            console.debugDetailed(`Started up Data Queue Writer!`);
            this.writingData = true;

            (async ()=>{
                while (true){
                    let nextQueuedItem = this.writeDataQueueList.shift();

                    if (!nextQueuedItem){
                        console.debugDetailed(`All data has been written up. Queue is now empty.`);
                        this.writingData = false;
                        if (this.internalFlushCallback){
                            this.internalFlushCallback();
                            this.internalFlushCallback = undefined;
                        }
                        break;

                    }

                    console.debugDetailed(`Now writing from the queue, data ${nextQueuedItem.dataName} at index ${nextQueuedItem.index}`);
                    await this.writeData(nextQueuedItem.buffer, nextQueuedItem.index, nextQueuedItem.dataName, nextQueuedItem.dataType);
                    console.debugDetailed(`Finished writing the data ${nextQueuedItem.dataName} at index ${nextQueuedItem.index} from queue!`);
                }
            })();
        }
    }

    // VERY UNSAFE IN PARALLEL CALLS. YOU
    // YOU MUST OBEY THE PROMISE YOU WILL GET SCREWED.
    // better yet get screwed less by using the safer writeDataQueue
    writeData(buffer: Buffer, index: number, dataName: string = "Unnamed", dataType: number = 0){
        return new Promise<void>(async (accept, reject)=>{
            console.debugDetailed("Preparing to write data...");

            let dataSizeClearance = this.blockSize - 192 - 16;

            let blocksRequired = Math.ceil(buffer.length / dataSizeClearance);

            let blockEPointer = this.getEPointerFromIndex(index);
            
            let preTaskRemaining = 0;

            let completePreTask = ()=>{
                preTaskRemaining -= 1;
                if (preTaskRemaining != 0)
                    return;
                let taskRemaining = blocksRequired;
    
                let completeTask = ()=>{
                    console.debugDetailed("Completed Write Block!");
                    taskRemaining -= 1;
                    if (taskRemaining == 0){
                        console.debugDetailed("Completed!");
                        accept();
                    }
                };
    
                for (let i = 0;i<blocksRequired;i++){
                    let bufferSlice = buffer.subarray(dataSizeClearance * i, dataSizeClearance * (i + 1));
    
                    console.debugDetailed(`Sending Write Request... Size: ${bufferSlice.length}, Index: ${i}`);
                    this.write(blockEPointer!.position + i, bufferSlice, dataName, dataType, i, i == (blocksRequired - 1)).then(completeTask).catch(reject);
                }
            }

            if (blockEPointer == undefined){
                preTaskRemaining += 1;
                console.debugDetailed("No Index found. Searching for an empty spot to place data.");
                let newBlockLocationEPointer = this.locateEmptyBlocks(blocksRequired);
                
                if (newBlockLocationEPointer.size != -1){
                    console.debugDetailed(`Determined the empty spot to not be at the end. Consuming ${blocksRequired} empty space...`);

                    let spaceRemaining = newBlockLocationEPointer.size - blocksRequired;
                    let newEmptySpacePosition = newBlockLocationEPointer.position + blocksRequired;

                    await this.setEPointer(newEmptySpacePosition, null, 0, spaceRemaining);
                }

                await this.setEPointer(newBlockLocationEPointer.position, index, 2, blocksRequired);
                
                blockEPointer = newBlockLocationEPointer;
                completePreTask();
            }else{
                console.debugDetailed("Index found. Overwritting old blocks.");

                preTaskRemaining += 1;

                await this.setEPointer(blockEPointer.position, index, 2, blocksRequired);
                
                if (blocksRequired < blockEPointer.size){
                    console.debugDetailed(`After allocation and overwritting... there is an excess of ${blockEPointer.size - blocksRequired} free blocks`);
                    await this.setEPointer(blockEPointer.position + blocksRequired, null, 0, blockEPointer.size - blocksRequired);
                }
                if (blocksRequired > blockEPointer.size){
                    let additionalBlocksRequired = blocksRequired - blockEPointer.size;
                    console.debugDetailed(`After allocation and overwritting... there is a need of ${additionalBlocksRequired} free blocks`);
                    
                    let newEPointerEndPosition = blockEPointer.position + blockEPointer.size;
                    for (let i = 0;i<additionalBlocksRequired;i++){
                        let ePointer = this.ePointers[newEPointerEndPosition + i] as EPointers | undefined;

                        if (ePointer){


                            switch(ePointer.type){
                                case 0:{
                                    let remainingEmptySpace = ePointer.size - (additionalBlocksRequired - i);
                                    console.debugDetailed(`Found empty blocks at ${ePointer.position} with a size ${ePointer.size}. Consumed ${additionalBlocksRequired - i} empty spaces.`);
                                    
                                    if (remainingEmptySpace > 0){
                                        // Commented this setEpointer function call because it's useless and causes intended behaviour by the delete this.ePointers operation.
                                        // await this.setEPointer(newEPointerEndPosition + i, null, 0, ePointer.size);
                                        await this.setEPointer(newEPointerEndPosition + additionalBlocksRequired, null, 0, remainingEmptySpace);
                                    }else{
                                        console.debugDetailed(`Consumed all the empty spaces here at ${ePointer.position}!`);
                                    }
                                    break;
                                }
                                case 2:{
                                    let remainingEmptySpace = ePointer.size - (additionalBlocksRequired - i);

                                    console.debugDetailed(`Found blocks with data at ${ePointer.position} with a size ${ePointer.size}. Relocating them...`);
                                    let newEPointer = this.locateEmptyBlocks(ePointer.size, newEPointerEndPosition + additionalBlocksRequired, (searchedEPointer)=>{
                                        return searchedEPointer.index == ePointer!.index;
                                    });
                                    console.debugDetailed(`Found an empty spot for the block of data at ${newEPointer.position}`);

                                    console.debugDetailed(`Relocating the blocks of data...`);
                                    for (let r = 0;r<ePointer.size;r++){
                                        preTaskRemaining += 1;
                                        console.debugDetailed(`Performing a copy request at ${ePointer.position + r} to ${newEPointer.position + r}...`);
                                        this.copy(ePointer.position + r, newEPointer.position + r).then(completePreTask).catch(reject);
                                    }
                                    await this.setEPointer(newEPointer.position, ePointer.index, ePointer.type, ePointer.size);
                                    // Commented this setEpointer function call because it's useless and causes intended behaviour by the delete this.ePointers operation.
                                    // await this.setEPointer(newEPointerEndPosition + i, null, 0, ePointer.size);
                                    if (remainingEmptySpace > 0){
                                        await this.setEPointer(newEPointerEndPosition + additionalBlocksRequired, null, 0, remainingEmptySpace);
                                    }else{
                                        console.debugDetailed(`Consumed all the empty spaces here at ${ePointer.position}!`);
                                    }
                                    break;
                                }
                            }
                            delete this.ePointers[newEPointerEndPosition + i];
                        }
                    }
                }
                completePreTask();
            }
        });
    }

    open(){
        return new Promise<void>((accept, reject)=>{

            let onFileHandlerCreation = (fileHandler: FileSystem.FileHandle)=>{

                this.fileHandler = fileHandler;
                
                openedLowLevelJadeDB.push(this);
    
                fileHandler.write("JADEDBv0.4", 0).then(async (results)=>{
    
                    console.debug("Reading EPointers...");
    
                    let currentIndex = 0;
    
                    this.ePointers = [];
    
                    let foundEpointers = 0;
    
                    while (true){

                        let rawBuffer = Buffer.alloc(7);
    
                        let blockLocation = Math.floor(currentIndex / 3);
                        let blockePointerIndex = currentIndex % 3;
    
                        let ePointerTable = await this.fileHandler!.read(rawBuffer, 0, 7, this.blockSize * blockLocation + 10 + 43 + blockePointerIndex * 7);
                        diskActivity.read += ePointerTable.bytesRead;
    
                        let isTerminal = ePointerTable.bytesRead == 0;
                        
                        if (isTerminal){
                            break;
                        }
    
                        let buffer = ePointerTable.buffer;
    
                        let isEPointerTerminal = (()=>{
                            let empty = true;
                            for (let i = 0;i<7;i++){
                                empty = 0 == buffer.at(i);
                                if (empty == false)
                                    break;
                            }
                            return empty;
                        })();
    
                        if (isEPointerTerminal){
                            // stupid fix now as for some reason epointers exist beyond terminated epointers which caused missing data issues.
                            currentIndex += 1;//ePointerSize;
                            console.debugDetailed(`Found null EPointer. at ${currentIndex} Skipping...`);
                            continue;
                        }
    
                        let ePointerType = buffer.readUIntBE(0, 1);
                        let ePointerIndex = buffer.readUIntBE(1, 3);
                        let ePointerSize = buffer.readUIntBE(4, 3);
    
                        if (ePointerType == 1){
                            currentIndex += 1;
                            continue;
                        }else{
    
                            let ePointer = {
                                position: currentIndex,
                                type: ePointerType,
                                index: ePointerIndex == 0 ? null : ePointerIndex - 1,
                                size: ePointerSize,
                            };
                            console.debugDetailed(`Found an EPointer located at ${ePointer.position}. Index: ${ePointer.index}, Size: ${ePointerSize}, Type: ${ePointerType}`);
                            
                            if (ePointer.index === null || (ePointer.index !== null && !this.ePointersIndex[ePointer.index])){
                                this.ePointers[currentIndex] = ePointer;
                                
                                if (ePointer.index !== null)
                                    this.ePointersIndex[ePointer.index] = ePointer;

                            }else{
                                console.warn(`Potential EPointer duplicate. The ${currentIndex} EPointer is attempting to overwrite already existing epointers. Ignoring EPointer.`);
                            }

    
                            currentIndex += ePointerSize;
                            foundEpointers += 1;
                            console.debugDetailed(`Reading EPointers ahead. Determined the block size is ${ePointerSize}. Predicting and jumping to ${currentIndex} to quick read EPointers.`);
                        }
    
                    }
    
                
                    console.debug(`Found Terminal Point! Stopping EPointers Scans! ${foundEpointers} Epointers are located`);
                    
                    accept();
    
                }).catch(reject);
            }
            
            FileSystem.open(this.filePath, "r+").then(fileHandler=>{
                console.debug("Successfully opened the database without creating a new file.")
                onFileHandlerCreation(fileHandler);
            }).catch(err=>{
                if (err.code == "ENOENT"){
                    console.debug("The database file does not exist. Attempting to create one...")
                    FileSystem.writeFile(this.filePath, "").then(()=>{
                        FileSystem.open(this.filePath, "r+").then(fileHandler=>{
                            console.debug("Successfully opened the database without creating a new file.")
                            onFileHandlerCreation(fileHandler);
                        }).catch(err=>{
                            console.debug("An unknown error has occured creating a new database.")
                        });
                    }).catch(()=>{
                        console.debug("Failed to create a new database.")
                    });
                }else{
                    reject(err);
                }
            });
        });
    }

    /**
     * Synchronous close. Causes the NodeJS to pause until this JadeDB closes forcefully.
     * ONLY USE UNDER EMERGENCY OPERATIONS.
     */
    halt(){
        openedLowLevelJadeDB.splice(openedLowLevelJadeDB.findIndex((va=>va==this)), 1);
        console.warn(`The JadeDB "${this.filePath}" has unexpectedly halted! Data corruption may be possible!`);
        let fileDescriptor = this.fileHandler!.fd;

        console.debugDetailed("An unexpected use of the halt function of JADEDB has been called!");
        console.debugDetailed("Writing EPointer Tables...");

        for (let index = 0;index<this.ePointers.length;index++){
            let ePointer = this.ePointers[index];

            if (!ePointer){
                ePointer = {
                    position: index,
                    index: null,
                    type: 1,
                    size: 1
                }
                continue;
            }

            let ePointerBuffer = Buffer.alloc(7);


            ePointerBuffer.writeUIntBE(ePointer.type, 0, 1);
            ePointerBuffer.writeUIntBE(ePointer.index !== null ? ePointer.index + 1 : 0, 1, 3);
            ePointerBuffer.writeUIntBE(ePointer.size, 4, 3);

            let blockLocation = Math.floor(index / 3);
            let ePointerIndex = index % 3;

            console.debugDetailed(`Written ${index} EPointer! Index: ${ePointerIndex} Type: ${ePointer.type}, Size: ${ePointer.size}`);
            diskActivity.write += FileSystemS.writeSync(fileDescriptor, ePointerBuffer, 0, 7, this.blockSize * blockLocation + 10 + 43 + ePointerIndex * 7);
        }

        FileSystemS.close(fileDescriptor);
    }

    flush(){
        return new Promise<void>((accept)=>{
            this.internalFlushCallback = accept;
        });
    }

    close(){
        return new Promise(async (accept, reject)=>{
            if (this.fileHandler){
                if (this.writingData){
                    console.debugDetailed("Flushing Database queue... Waiting...");
                    await this.flush();
                }

                console.debugDetailed("Closing JadeDB");
                console.debugDetailed("Writing EPointer Tables...");
                openedLowLevelJadeDB.splice(openedLowLevelJadeDB.findIndex((va=>va==this)), 1);

                for (let index = 0;index<=this.ePointers.length;index++){
                    await this.writeEPointer(index);
                }

                this.fileHandler.close().then(accept).catch(reject);
            }else{
                reject();
            }
        });
    }

    writeEPointer(index: number){
        return new Promise<void>(async (accept, reject)=>{
            if (!this.fileHandler){
                return reject();
            }
            let ePointer = this.ePointers[index];

            if (!ePointer){
                if (index >= this.ePointers.length){
                    ePointer = {
                        position: index,
                        index: null,
                        type: 0,
                        size: 0
                    }
                }else{
                    ePointer = {
                        position: index,
                        index: null,
                        type: 1,
                        size: 1
                    }
                    return accept();
                }
            }
            
            let ePointerBuffer = Buffer.alloc(7);

            ePointerBuffer.writeUIntBE(ePointer.type, 0, 1);
            ePointerBuffer.writeUIntBE(ePointer.index !== null ? ePointer.index + 1 : 0, 1, 3);
            ePointerBuffer.writeUIntBE(ePointer.size, 4, 3);

            let blockLocation = Math.floor(index / 3);
            let ePointerIndex = index % 3;

            console.debugDetailed(`Writing ${index} EPointer! Index: ${ePointer.index} Type: ${ePointer.type}, Size: ${ePointer.size}`);
            diskActivity.write += (await this.fileHandler.write(ePointerBuffer, 0, 7, this.blockSize * blockLocation + 10 + 43 + ePointerIndex * 7)).bytesWritten;
            accept();
        });
    }

    saveAllEpointers(){
        return new Promise<void>(async (accept, reject)=>{
            if (this.fileHandler){
                for (let index = 0;index<=this.ePointers.length;index++){
                    await this.writeEPointer(index);
                }
                accept();
            }else
                reject();
        });

    }

    setEPointer(position: number, index: number | null = null, type: number, size: number){
        return new Promise<void>(async (accept, reject)=>{
            if (index !== null){
                let occupiedIndex = this.getEPointerFromIndex(index);
                if (occupiedIndex){
                    occupiedIndex.index = null;
                }
            }
            if (position < 0){
                throw new Error("Cannot have a negative position.");
            }
            if (index !== null && index < 0){
                throw new Error("Cannot have a negative index.");
            } 
    
            let ePointer = {
                position,
                index,
                type,
                size
            };
    
            console.debugDetailed(`Setting a new epointer at block position ${position}. Index: ${index}, Type: ${type} and Size: ${size}`);
            
            if (index !== null)
                this.ePointersIndex[index] = ePointer;
            
            this.ePointers[position] = ePointer;
            console.debugDetailed("Current EPointer Table: ", this.ePointers);
            await this.writeEPointer(position);
            accept();
        });
        // this.saveAllEpointers();
    }

    getEPointerFromBlockPosition(blockPosition: number): EPointers | undefined{
        console.debugDetailed(`Fetching the EPointer assoicated with the data block ${blockPosition}`);
        return this.ePointers[blockPosition];
    }

    getEPointerFromIndex(index: number): EPointers | undefined{
        console.debugDetailed(`Fetching the EPointer assoicated with the data index ${index}`);
        return this.ePointersIndex[index];
    }
}

console.bindToExit(()=>{
    if (openedLowLevelJadeDB.length > 0){
        console.log(`Closing ${openedLowLevelJadeDB.length} Low Level Jade DB`);
        for (let openedDB of openedLowLevelJadeDB){
            openedDB.halt();
        }
        console.log(`Successfully closed all databases!`);
    }
});

// export class SimpleArrayJadeDB extends LowLevelJadeDB{

//     arrayProperties = {
//         Length: 0
//     };

//     constructor(fileName: string){
//         super(fileName);
//     }

//     reloadProperties(){
//         return new Promise<void>(async (accept, reject)=>{
//             if (await super.exists(0) == false){
//                 await super.write(0, BufferOperations.toBuffer(JSON.stringify(this.arrayProperties)));
//             }else{
//                 let block = await super.read(0);

//                 let newArrayProperties: {
//                     Length: number
//                 } = JSON.parse(block.OutputBuffer.toString());

//                 for (let index in newArrayProperties){
//                     (this.arrayProperties as any)[index] = (newArrayProperties as any)[index];
//                 }
//             }

//             accept();
//         });
//     }

//     open(): Promise<void> {
//         return new Promise((accept, reject)=>{
//             super.open().then(()=>{
//                 this.reloadProperties().then(accept).catch(reject);
//             }, reject);
//         });
//     }
// }
