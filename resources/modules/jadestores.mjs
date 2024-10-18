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
import * as console from "./consolescript.mjs";
import * as FileSystem from "fs/promises";
import * as FileSystemS from "fs";
import * as Crypto from "crypto";
let diskActivity = {
    read: 0,
    write: 0,
    timeSinceMeasured: Date.now()
};
// let a = setInterval(()=>{
//     console.log(`READ: ${nearByteConversion(diskActivity.read)}`);
//     console.log(`WRITE: ${nearByteConversion(diskActivity.write)}`);
//     diskActivity.read = 0;
//     diskActivity.write = 0;
// }, 1000);
function nearByteConversion(bytes) {
    if (bytes > 1000) {
        bytes /= 1000;
        if (bytes > 1000) {
            bytes /= 1000;
            if (bytes > 1000) {
                return `${Math.round(bytes)} gigabytes`;
            }
            return `${Math.round(bytes)} megabytes`;
        }
        return `${Math.round(bytes)} kilobytes`;
    }
    return `${Math.round(bytes)} bytes`;
}
class BufferOperations {
    static add(buffer1, buffer2) {
        let newBuffer = Buffer.alloc(buffer1.length + buffer2.length);
        newBuffer.write(buffer1.toString("binary"), "binary");
        newBuffer.write(buffer2.toString("binary"), buffer1.length, "binary");
        return newBuffer;
    }
    static toBuffer(string) {
        let buffer = Buffer.alloc(string.length);
        buffer.write(string);
        return buffer;
    }
}
let openedLowLevelJadeDB = [];
export class LowLevelJadeDB {
    blockSize;
    encryptionKey = null;
    filePath = "";
    fileHandler = null;
    ePointers = [];
    ePointersIndex = [];
    constructor(fileName, blockSize = 8192, password) {
        if (blockSize <= 192 + 16) {
            throw new Error("Cannot to create a JadeDB with a block size less than or equal to 208 bytes.");
        }
        this.filePath = fileName;
        this.blockSize = blockSize;
        if (password) {
            this.encryptionKey = Crypto.scryptSync(password, "salt", 32);
        }
    }
    setEncryptionKey(password) {
        if (password) {
            this.encryptionKey = Crypto.scryptSync(password, "salt", 32);
        }
        else {
            this.encryptionKey = null;
        }
    }
    exists(blockLocation) {
        return new Promise((accept, reject) => {
            console.debugDetailed(`Sending an Exist Request to Block location ${blockLocation}`);
            if (this.fileHandler == null) {
                reject("This DataBase has not been opened!");
                return;
            }
            let rawBuffer = Buffer.alloc(this.blockSize);
            this.fileHandler.read(rawBuffer, 0, this.blockSize, this.blockSize * blockLocation + 10).then(results => {
                accept(results.bytesRead == this.blockSize);
            }).catch(reject);
        });
    }
    copy(blockLocation, newBlockLocation) {
        return new Promise((accept, reject) => {
            console.debugDetailed(`Sending an Copy Request from Block location ${blockLocation} to ${newBlockLocation}`);
            if (this.fileHandler == null) {
                reject("This DataBase has not been opened!");
                return;
            }
            let rawBuffer = Buffer.alloc(this.blockSize);
            this.fileHandler.read(rawBuffer, 0, this.blockSize, this.blockSize * blockLocation + 10).then(results => {
                console.debugDetailed(`Read the entire block contents of ${blockLocation}`);
                console.debugDetailed(`Pre-writing EPointers to this specific block location ${newBlockLocation}`);
                let startingEPointerIndex = newBlockLocation * 3;
                for (let index = startingEPointerIndex; index < Math.min(this.ePointers.length, startingEPointerIndex + 3); index++) {
                    let ePointer = this.ePointers[index];
                    if (!ePointer) {
                        ePointer = {
                            position: index,
                            index: null,
                            type: 1,
                            size: 1
                        };
                    }
                    let ePointerBuffer = Buffer.alloc(7);
                    ePointerBuffer.writeUIntBE(ePointer.type, 0, 1);
                    ePointerBuffer.writeUIntBE(ePointer.index !== null ? ePointer.index + 1 : 0, 1, 3);
                    ePointerBuffer.writeUIntBE(ePointer.size, 4, 3);
                    let ePointerIndex = index % 3;
                    results.buffer.write(ePointerBuffer.toString("binary"), 43 + ePointerIndex * 7, "binary");
                }
                console.debugDetailed(`Copying the block content to ${newBlockLocation} from ${blockLocation}`);
                this.fileHandler.write(results.buffer, 0, this.blockSize, this.blockSize * newBlockLocation + 10).then(accept).catch(reject);
            }).catch(reject);
        });
    }
    read(blockLocation) {
        return new Promise((accept, reject) => {
            console.debugDetailed(`Sending a Read Request at Block Location ${blockLocation}`);
            if (this.fileHandler == null) {
                reject("This DataBase has not been opened!");
                return;
            }
            let rawBuffer = Buffer.alloc(this.blockSize);
            this.fileHandler.read(rawBuffer, 0, this.blockSize, this.blockSize * blockLocation + 10).then(results => {
                if (results.bytesRead == 0) {
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
                if (bufferLength > this.blockSize) {
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
                if (verifiedChkSum == false) {
                    console.warn("The checksum algorithm has failed to verify the data integrity. Data corruption is possible.");
                }
                let isEncrypted = (() => {
                    let empty = true;
                    for (let i = 0; i < 16; i++) {
                        empty = 0 == initializationVector.at(i);
                        if (empty == false)
                            break;
                    }
                    return empty != true;
                })();
                if (isEncrypted) {
                    console.debugDetailed(`The Header indicates that the contents may be encrypted. Prompting and using the Decryption Key...`);
                }
                if (this.encryptionKey && isEncrypted) {
                    let decipher = Crypto.createDecipheriv("aes-256-cbc", this.encryptionKey, initializationVector);
                    let decipherName = Crypto.createDecipheriv("aes-256-cbc", this.encryptionKey, initializationVector);
                    console.debugDetailed(`Decrypting the blockname and blockdata`);
                    try {
                        blockName = BufferOperations.add(decipherName.update(blockName), decipherName.final());
                        outputBuffer = BufferOperations.add(decipher.update(outputBuffer), decipher.final());
                    }
                    catch (er) {
                        reject("Failed to decrypt the data. Incorrect Password.");
                        return;
                    }
                }
                else if (isEncrypted && this.encryptionKey == null) {
                    console.warn("You just read encrypted data. This data needs a password to be used.");
                }
                else if (isEncrypted == false && this.encryptionKey) {
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
    write(blockLocation, buffer, blockName = "", blockType = 1, beindx = 1, terminal = true) {
        return new Promise((accept, reject) => {
            console.debugDetailed(`Sending a Write Request... of Block Location ${blockLocation}, blockName ${blockName} and blockType ${blockType}`);
            if (this.fileHandler == null) {
                reject("This DataBase has not been opened!");
                return;
            }
            if (beindx < 0) {
                reject("BEIndex cannot be less than zero.");
                return;
            }
            blockName = blockName.substring(0, 31);
            blockName += "\0".repeat(31 - blockName.length);
            let write = (buffer, blockName, initializationVector) => {
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
                    for (let index = startingEPointerIndex; index < Math.min(this.ePointers.length, startingEPointerIndex + 3); index++) {
                        let ePointer = this.ePointers[index];
                        if (!ePointer) {
                            ePointer = {
                                position: index,
                                index: null,
                                type: 1,
                                size: 1
                            };
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
                this.fileHandler.write(ingressBuffer, 0, this.blockSize, this.blockSize * blockLocation + 10).then(results => {
                    diskActivity.write += results.bytesWritten;
                    accept();
                }).catch(reject);
            };
            if (this.encryptionKey) {
                let initializationVector = Buffer.alloc(16);
                Crypto.randomFill(initializationVector, () => {
                    let cipher = Crypto.createCipheriv("aes-256-cbc", this.encryptionKey, initializationVector);
                    let encryptedBuffer = BufferOperations.add(cipher.update(buffer), cipher.final());
                    let cipherName = Crypto.createCipheriv("aes-256-cbc", this.encryptionKey, initializationVector);
                    let encryptedName = BufferOperations.add(cipherName.update(blockName), cipherName.final()).toString("binary");
                    console.debugDetailed(`Encrypted the block ${blockLocation}`);
                    write(encryptedBuffer, encryptedName, initializationVector);
                });
            }
            else {
                write(buffer, blockName, null);
            }
        });
    }
    locateEmptyBlocks(minimumSpace, startPosition = 0, ignoreConditions) {
        console.debugDetailed(`Searching for empty blocks with a minimum requirement of ${minimumSpace}, starting at ${startPosition}`);
        let ePointers = this.ePointers;
        let reservedSpace = null;
        let lastEmpty = null;
        for (let i = 0; i < ePointers.length; i++) {
            let ePointer = ePointers[i];
            if (ePointer) {
                if (ignoreConditions && ignoreConditions(ePointer)) {
                    continue;
                }
                lastEmpty = null;
                reservedSpace = null;
                switch (ePointer.type) {
                    case 0: {
                        lastEmpty = ePointer.position;
                        if (ePointer.size >= minimumSpace && startPosition <= i) {
                            return ePointer;
                        }
                        break;
                    }
                    case 2: {
                        reservedSpace = ePointer.size + ePointer.position;
                        break;
                    }
                }
            }
        }
        if (lastEmpty) {
            console.debugDetailed(`Found such requirements at ${lastEmpty}`);
            return {
                index: null,
                position: lastEmpty,
                type: 0,
                size: -1
            };
        }
        else {
            console.debugDetailed(`Found such requirements at ${reservedSpace ? reservedSpace : ePointers.length}`);
            return {
                index: null,
                position: reservedSpace ? reservedSpace : ePointers.length,
                type: 0,
                size: -1
            };
        }
    }
    readData(index) {
        return new Promise((accept, reject) => {
            let blockLocation = this.getEPointerFromIndex(index);
            console.debugDetailed(`Preparing to read data...`);
            if (blockLocation) {
                if (blockLocation.type != 2) {
                    return reject(`The Index ${index} is not a readable block.`);
                }
                console.debugDetailed(`Located blocks!`);
                let dataSizeClearance = this.blockSize - 192 - 16;
                let compiledBufferArry = Buffer.alloc(blockLocation.size * dataSizeClearance);
                let completedTask = 0;
                let actualDataSize = 0;
                let dataName = "";
                let dataType = 0;
                let completeTask = (dataBlock, bindex) => {
                    actualDataSize += dataBlock.length;
                    compiledBufferArry.write(dataBlock.toString('binary'), bindex * dataSizeClearance, "binary");
                    if (completedTask == blockLocation.size) {
                        console.debugDetailed(`Completed Read Task`);
                        console.debugDetailed(`Finished Building the Data`);
                        accept({
                            DataName: dataName.replace(/\0.+/, ""),
                            DataType: dataType,
                            Buffer: compiledBufferArry.subarray(0, actualDataSize)
                        });
                    }
                };
                for (let i = 0; i < blockLocation.size; i++) {
                    console.debugDetailed(`Sending Read Request...`);
                    let currentPosition = blockLocation.position + i;
                    this.read(blockLocation.position + i).then(data => {
                        if (data.VerifiedCheckSum == false) {
                            console.warn(`Checksum failed. Data Corruption is possible at block ${currentPosition} and index ${i}`);
                        }
                        dataName = data.BlockName;
                        dataType = data.BlockType;
                        console.debugDetailed(`Finished reading BIndex: ${data.BIndex}`);
                        completedTask += 1;
                        completeTask(data.OutputBuffer, data.BIndex);
                    }).catch((err) => {
                        console.error(`Critical error when reading block ${currentPosition} index ${i}: ${err}`);
                        reject(err);
                    });
                }
            }
            else {
                return reject(`Cannot determine the location of index ${index}`);
            }
        });
    }
    getArrayLength() {
        let items = 0;
        for (let ePointer of this.ePointersIndex) {
            if (ePointer.type == 2) {
                items += 1;
            }
        }
        return items;
    }
    getByteLength() {
        let bytes = 0;
        for (let ePointer of this.ePointers) {
            bytes += ePointer.size * this.blockSize;
        }
        return bytes;
    }
    writeData(buffer, index, dataName = "Unnamed", dataType = 0) {
        return new Promise((accept, reject) => {
            console.debugDetailed("Preparing to write data...");
            let dataSizeClearance = this.blockSize - 192 - 16;
            let blocksRequired = Math.ceil(buffer.length / dataSizeClearance);
            let blockEPointer = this.getEPointerFromIndex(index);
            let preTaskRemaining = 0;
            let completePreTask = () => {
                preTaskRemaining -= 1;
                if (preTaskRemaining != 0)
                    return;
                let taskRemaining = blocksRequired;
                let completeTask = () => {
                    console.debugDetailed("Completed Write Block!");
                    taskRemaining -= 1;
                    if (taskRemaining == 0) {
                        console.debugDetailed("Completed!");
                        accept();
                    }
                };
                for (let i = 0; i < blocksRequired; i++) {
                    let bufferSlice = buffer.subarray(dataSizeClearance * i, dataSizeClearance * (i + 1));
                    console.debugDetailed(`Sending Write Request... Size: ${bufferSlice.length}, Index: ${i}`);
                    this.write(blockEPointer.position + i, bufferSlice, dataName, dataType, i, i == (blocksRequired - 1)).then(completeTask).catch(reject);
                }
            };
            if (blockEPointer == undefined) {
                preTaskRemaining += 1;
                console.debugDetailed("No Index found. Searching for an empty spot to place data.");
                let newBlockLocationEPointer = this.locateEmptyBlocks(blocksRequired);
                if (newBlockLocationEPointer.size != -1) {
                    console.debugDetailed(`Determined the empty spot to not be at the end. Consuming ${blocksRequired} empty space...`);
                    let spaceRemaining = newBlockLocationEPointer.size - blocksRequired;
                    let newEmptySpacePosition = newBlockLocationEPointer.position + blocksRequired;
                    this.setEPointer(newEmptySpacePosition, null, 0, spaceRemaining);
                }
                this.setEPointer(newBlockLocationEPointer.position, index, 2, blocksRequired);
                blockEPointer = newBlockLocationEPointer;
                completePreTask();
            }
            else {
                console.debugDetailed("Index found. Overwritting old blocks.");
                preTaskRemaining += 1;
                this.setEPointer(blockEPointer.position, index, 2, blocksRequired);
                if (blocksRequired < blockEPointer.size) {
                    console.debugDetailed(`After allocation and overwritting... there is an excess of ${blockEPointer.size - blocksRequired} free blocks`);
                    this.setEPointer(blockEPointer.position + blocksRequired, null, 0, blockEPointer.size - blocksRequired);
                }
                if (blocksRequired > blockEPointer.size) {
                    let additionalBlocksRequired = blocksRequired - blockEPointer.size;
                    console.debugDetailed(`After allocation and overwritting... there is a need of ${additionalBlocksRequired} free blocks`);
                    let newEPointerEndPosition = blockEPointer.position + blockEPointer.size;
                    for (let i = 0; i < additionalBlocksRequired; i++) {
                        let ePointer = this.ePointers[newEPointerEndPosition + i];
                        if (ePointer) {
                            delete this.ePointers[newEPointerEndPosition + i];
                            switch (ePointer.type) {
                                case 0: {
                                    let remainingEmptySpace = ePointer.size - (additionalBlocksRequired - i);
                                    console.debugDetailed(`Found empty blocks at ${ePointer.position} with a size ${ePointer.size}. Consumed ${additionalBlocksRequired - i} empty spaces.`);
                                    if (remainingEmptySpace > 0) {
                                        this.setEPointer(newEPointerEndPosition + additionalBlocksRequired, null, 0, remainingEmptySpace);
                                    }
                                    else {
                                        console.debugDetailed(`Consumed all the empty spaces here at ${ePointer.position}!`);
                                    }
                                    break;
                                }
                                case 2: {
                                    console.debugDetailed(`Found blocks with data at ${ePointer.position} with a size ${ePointer.size}. Relocating them...`);
                                    let newEPointer = this.locateEmptyBlocks(ePointer.size, newEPointerEndPosition + additionalBlocksRequired, (searchedEPointer) => {
                                        return searchedEPointer.index == ePointer.index;
                                    });
                                    console.debugDetailed(`Found an empty spot for the block of data at ${newEPointer.position}`);
                                    this.setEPointer(newEPointer.position, ePointer.index, ePointer.type, ePointer.size);
                                    console.debugDetailed(`Relocating the blocks of data...`);
                                    for (let r = 0; r < ePointer.size; r++) {
                                        preTaskRemaining += 1;
                                        console.debugDetailed(`Performing a copy request at ${ePointer.position + r} to ${newEPointer.position + r}...`);
                                        this.copy(ePointer.position + r, newEPointer.position + r).then(completePreTask).catch(reject);
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
                completePreTask();
            }
        });
    }
    open() {
        return new Promise((accept, reject) => {
            FileSystem.open(this.filePath, "a+").then(fileHandler => {
                this.fileHandler = fileHandler;
                openedLowLevelJadeDB.push(this);
                fileHandler.write("JADEDBv0.3", 0).then(async (results) => {
                    console.debug("Reading EPointers...");
                    let currentIndex = 0;
                    this.ePointers = [];
                    let foundEpointers = 0;
                    while (true) {
                        let rawBuffer = Buffer.alloc(7);
                        let blockLocation = Math.floor(currentIndex / 3);
                        let blockePointerIndex = currentIndex % 3;
                        let ePointerTable = await this.fileHandler.read(rawBuffer, 0, 7, this.blockSize * blockLocation + 10 + 43 + blockePointerIndex * 7);
                        diskActivity.read += ePointerTable.bytesRead;
                        let isTerminal = ePointerTable.bytesRead == 0;
                        if (isTerminal) {
                            break;
                        }
                        let buffer = ePointerTable.buffer;
                        let isEPointerTerminal = (() => {
                            let empty = true;
                            for (let i = 0; i < 7; i++) {
                                empty = 0 == buffer.at(i);
                                if (empty == false)
                                    break;
                            }
                            return empty;
                        })();
                        if (isEPointerTerminal) {
                            break;
                        }
                        let ePointerType = buffer.readUIntBE(0, 1);
                        let ePointerIndex = buffer.readUIntBE(1, 3);
                        let ePointerSize = buffer.readUIntBE(4, 3);
                        if (ePointerType == 1) {
                            currentIndex += 1;
                            continue;
                        }
                        else {
                            let ePointer = {
                                position: currentIndex,
                                type: ePointerType,
                                index: ePointerIndex == 0 ? null : ePointerIndex - 1,
                                size: ePointerSize,
                            };
                            console.debugDetailed(`Found an EPointer located at ${ePointer.position}. Index: ${ePointerIndex}, Size: ${ePointerSize}, Type: ${ePointerType}`);
                            this.ePointers[currentIndex] = ePointer;
                            if (ePointer.index !== null)
                                this.ePointersIndex[ePointer.index] = ePointer;
                            currentIndex += ePointerSize;
                            foundEpointers += 1;
                            console.debugDetailed(`Reading EPointers ahead. Determined the block size is ${Math.floor(ePointerSize / 3)}. Predicting and jumping to ${blockLocation} to quick read EPointers.`);
                        }
                    }
                    console.debug(`Found Terminal Point! Stopping EPointers Scans! ${foundEpointers} Epointers are located`);
                    accept();
                }).catch(reject);
            });
        });
    }
    /**
     * Synchronous close. Causes the NodeJS to pause until this JadeDB closes forcefully.
     * ONLY USE UNDER EMERGENCY OPERATIONS.
     */
    halt() {
        openedLowLevelJadeDB.splice(openedLowLevelJadeDB.findIndex((va => va == this)), 1);
        console.warn(`The JadeDB "${this.filePath}" has unexpectedly halted! Data corruption may be possible!`);
        let fileDescriptor = this.fileHandler.fd;
        console.debugDetailed("An unexpected use of the halt function of JADEDB has been called!");
        console.debugDetailed("Writing EPointer Tables...");
        for (let index = 0; index < this.ePointers.length; index++) {
            let ePointer = this.ePointers[index];
            if (!ePointer) {
                ePointer = {
                    position: index,
                    index: null,
                    type: 1,
                    size: 1
                };
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
    close() {
        return new Promise(async (accept, reject) => {
            if (this.fileHandler) {
                console.debugDetailed("Closing JadeDB");
                console.debugDetailed("Writing EPointer Tables...");
                openedLowLevelJadeDB.splice(openedLowLevelJadeDB.findIndex((va => va == this)), 1);
                for (let index = 0; index < this.ePointers.length; index++) {
                    let ePointer = this.ePointers[index];
                    if (!ePointer) {
                        ePointer = {
                            position: index,
                            index: null,
                            type: 1,
                            size: 1
                        };
                        continue;
                    }
                    let ePointerBuffer = Buffer.alloc(7);
                    ePointerBuffer.writeUIntBE(ePointer.type, 0, 1);
                    ePointerBuffer.writeUIntBE(ePointer.index !== null ? ePointer.index + 1 : 0, 1, 3);
                    ePointerBuffer.writeUIntBE(ePointer.size, 4, 3);
                    let blockLocation = Math.floor(index / 3);
                    let ePointerIndex = index % 3;
                    console.debugDetailed(`Writing ${index} EPointer! Index: ${ePointer.index} Type: ${ePointer.type}, Size: ${ePointer.size}`);
                    diskActivity.write += (await this.fileHandler.write(ePointerBuffer, 0, 7, this.blockSize * blockLocation + 10 + 43 + ePointerIndex * 7)).bytesWritten;
                }
                this.fileHandler.close().then(accept).catch(reject);
            }
            else {
                reject();
            }
        });
    }
    saveAllEpointers() {
        return new Promise(async (accept, reject) => {
            if (this.fileHandler) {
                for (let index = 0; index < this.ePointers.length; index++) {
                    let ePointer = this.ePointers[index];
                    if (!ePointer) {
                        ePointer = {
                            position: index,
                            index: null,
                            type: 1,
                            size: 1
                        };
                        continue;
                    }
                    let ePointerBuffer = Buffer.alloc(7);
                    ePointerBuffer.writeUIntBE(ePointer.type, 0, 1);
                    ePointerBuffer.writeUIntBE(ePointer.index !== null ? ePointer.index + 1 : 0, 1, 3);
                    ePointerBuffer.writeUIntBE(ePointer.size, 4, 3);
                    let blockLocation = Math.floor(index / 3);
                    let ePointerIndex = index % 3;
                    console.debugDetailed(`Writing ${index} EPointer! Index: ${ePointer.index} Type: ${ePointer.type}, Size: ${ePointer.size}`);
                    diskActivity.write += (await this.fileHandler.write(ePointerBuffer, 0, 7, this.blockSize * blockLocation + 10 + 43 + ePointerIndex * 7)).bytesWritten;
                }
                accept();
            }
            else
                reject();
        });
    }
    setEPointer(position, index = null, type, size) {
        if (index !== null) {
            let occupiedIndex = this.getEPointerFromIndex(index);
            if (occupiedIndex) {
                occupiedIndex.index = null;
            }
        }
        if (position < 0) {
            throw new Error("Cannot have a negative position.");
        }
        if (index !== null && index < 0) {
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
        // this.saveAllEpointers();
    }
    getEPointerFromBlockPosition(blockPosition) {
        console.debugDetailed(`Fetching the EPointer assoicated with the data block ${blockPosition}`);
        return this.ePointers[blockPosition];
    }
    getEPointerFromIndex(index) {
        console.debugDetailed(`Fetching the EPointer assoicated with the data index ${index}`);
        return this.ePointersIndex[index];
    }
}
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
//# sourceMappingURL=jadestores.mjs.map