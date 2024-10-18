/**
 * JadesTS-JS MODULES >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
 * -----------------------------------------------------
 * ART.TS
 * -----------------------------------------------------
 *
 * Author: Joshua Null (TheJades)
 *
 * what is it about
 *
 *  ⚬ delivering basic functionality for canvas context 2d drawing
 *  ⚬ adds the class obtainable image for easy image caching and handling for canvas context 2d drawing
 *  ⚬ provides a wrap engine for basic text wrapping
 *  ⚬ provides color mixing and basic color objects
 *  ⚬ adds basic image manipulation
 *
 *
 *
 * heve fun
 */
/**
 */
export class ObtainableImage {
    static emptyImage = typeof window === "undefined" ? null : document.createElement("img");
    static attemptToGetImage(image) {
        if (image && image.imageURL !== undefined) {
            let obtainableImage = image;
            let imageURL = obtainableImage.imageURL;
            if (obtainableImage.preloading == false) {
                obtainableImage.preloading = true;
                ImageDownloader.preloadImage(imageURL).then(img => {
                    obtainableImage.resource = img;
                    obtainableImage.loaded = true;
                    for (let callback of obtainableImage.callbacks) {
                        callback(obtainableImage.resource);
                    }
                });
            }
            return obtainableImage.resource;
        }
        else {
            return image;
        }
    }
    imageURL;
    resource = ObtainableImage.emptyImage;
    callbacks = [];
    preloading = false;
    loaded = false;
    constructor(imageURL) {
        this.imageURL = imageURL;
        // ImageDownloader.preloadImage(imageURL).then(img=>{
        //     this.resource = img;
        //     this.loaded = true;
        //     for (let callback of this.callbacks){
        //         callback(this.resource);
        //     }
        // });
    }
    onload(callback) {
        if (this.resource != ObtainableImage.emptyImage) {
            callback(this.resource);
        }
        else
            this.callbacks.push(callback);
    }
}
export class ImageDownloader {
    static imageCache = new Map();
    static completed = new Map();
    static preloadImage(imageURL) {
        return new Promise((accept, reject) => {
            if (ImageDownloader.imageCache.has(imageURL)) {
                let image = ImageDownloader.imageCache.get(imageURL);
                if (ImageDownloader.completed.has(imageURL) == false) {
                    return image.addEventListener("load", () => {
                        return accept(image);
                    }, { once: true });
                }
                else
                    return accept(ImageDownloader.imageCache.get(imageURL));
            }
            let image = document.createElement("img");
            ImageDownloader.imageCache.set(imageURL, image);
            image.addEventListener("load", (event) => {
                ImageDownloader.completed.set(imageURL, true);
                return accept(image);
            }, { once: true });
            image.src = imageURL;
        });
    }
}
export class WrapEngine {
    static wrapCache = new Map();
    static attemptWrap(drawingContext, text, maxWidth) {
        // if (text == "")
        //     return "";
        // let wrapKey = `FONT:${drawingContext.font}\0;TEXT:${text}`;
        // if (this.wrapCache.has(wrapKey)){
        //     return this.wrapCache.get(wrapKey)!;
        // }
        let currentLines = text.split(/\n/);
        let newLines = [];
        for (let line of currentLines) {
            let currentWidth = 0;
            let newLine = "";
            let splittableWords = line.split(/ /);
            for (let word of splittableWords) {
                let wordWidth = drawingContext.measureText(`${word} `).width;
                if (wordWidth + currentWidth > maxWidth) {
                    newLines.push(newLine);
                    currentWidth = 0;
                    newLine = "";
                }
                currentWidth += wordWidth;
                newLine += `${word} `;
            }
            if (newLine.length > 0)
                newLines.push(newLine);
        }
        let usableLines = 0;
        for (let line of newLines) {
            if (line.match(/^ +$/)) {
                break;
            }
            usableLines += 1;
        }
        newLines = newLines.splice(0, usableLines);
        let result = newLines.join("\n");
        // WrapEngine.wrapCache.set(wrapKey, result);
        return result;
    }
    static fillTextLN(drawingContext, text, x, y, lineHeight = 0) {
        let lines = text.split(/\n/);
        let currentHeight = 0;
        for (let line of lines) {
            drawingContext.fillText(line, x, y + currentHeight);
            let measurementResults = drawingContext.measureText(line);
            currentHeight += measurementResults.actualBoundingBoxDescent + lineHeight;
        }
    }
    static measureHeight(drawingContext, text) {
        if (text.length == 0)
            return 0;
        let lines = text.split(/\n/);
        let currentHeight = 0;
        for (let line of lines) {
            let measurementResults = drawingContext.measureText(line);
            currentHeight += measurementResults.actualBoundingBoxDescent;
        }
        return currentHeight;
    }
}
export class Color {
    r = 0;
    g = 0;
    b = 0;
    a = 1;
    static fromArray(array) {
        return new Color(array[0], array[1], array[2], array[3] || 0);
    }
    static measureBrightness(c) {
        return (c.r + c.g + c.b) / 3.0 / 255;
    }
    static immediate(r, g, b, a = 1) {
        return new Color(r, g, b, a).toStyle();
    }
    constructor(r, g, b, a = 1) {
        this.r = Math.min(255, Math.max(0, r));
        this.g = Math.min(255, Math.max(0, g));
        this.b = Math.min(255, Math.max(0, b));
        this.a = a;
    }
    toHex() {
        let characters = "0123456789abcdef";
        function getHexdecimalValue(number) {
            return `${characters[Math.floor(number / 16)]}${characters[Math.floor(number % 16)]}`;
        }
        return `${getHexdecimalValue(this.r)}${getHexdecimalValue(this.g)}${getHexdecimalValue(this.b)}`;
    }
    toStyle() {
        return `rgba(${this.r}, ${this.g}, ${this.b}, ${this.a})`;
    }
    toANSIBackground() {
        return `\x1B[48;2;${Math.round(this.r)};${Math.round(this.g)};${Math.round(this.b)}m`;
    }
    toANSIForeground() {
        return `\x1B[38;2;${Math.round(this.r)};${Math.round(this.g)};${Math.round(this.b)}m`;
    }
}
export class ColorMixer {
    static screen(a, b) {
        return new Color(255 - (255 - a.r) * (255 - b.r) / 255, 255 - (255 - a.g) * (255 - b.g) / 255, 255 - (255 - a.b) * (255 - b.b) / 255);
    }
    static multiply(a, b) {
        return new Color(a.r * b.r / 255, a.g * b.g / 255, a.b * b.b / 255);
    }
    static lerp(a, b, lerpFactor) {
        return new Color(a.r + (b.r - a.r) * lerpFactor, a.g + (b.g - a.g) * lerpFactor, a.b + (b.b - a.b) * lerpFactor, a.a + (b.a - a.a) * lerpFactor);
    }
    static darken(a) {
        return new Color(Math.max(a.r * 0.7, 0), Math.max(a.g * 0.7, 0), Math.max(a.b * 0.7, 0), a.a);
    }
    static brighten(color) {
        let r = color.r;
        let g = color.g;
        let b = color.b;
        let alpha = color.a;
        /* From 2D group:
        * 1. black.brighter() should return grey
        * 2. applying brighter to blue will always return blue, brighter
        * 3. non pure color (non zero rgb) will eventually return white
        */
        let i = Math.floor(1.0 / (1.0 - 0.7));
        if (r == 0 && g == 0 && b == 0) {
            return new Color(i, i, i, alpha);
        }
        if (r > 0 && r < i)
            r = i;
        if (g > 0 && g < i)
            g = i;
        if (b > 0 && b < i)
            b = i;
        return new Color(Math.min(r / 0.7, 255), Math.min(g / 0.7, 255), Math.min(b / 0.7, 255), alpha);
    }
    static newOpacity(a, alpha) {
        return new Color(a.r, a.g, a.b, alpha);
    }
}
export class ExtraShapes {
    static pathSRect(drawingContext, x, y, width, height, radius, close = true) {
        radius = Math.min(radius, Math.min(width, height) / 2);
        drawingContext.beginPath();
        drawingContext.moveTo(x, y + radius);
        drawingContext.arc(x + radius, y + radius, radius, Math.PI, 3 * Math.PI / 2, false);
        drawingContext.arc(x + width - radius, y + radius, radius, 3 * Math.PI / 2, 0, false);
        drawingContext.arc(x + width - radius, y + height - radius, radius, 0, Math.PI / 2, false);
        drawingContext.arc(x + radius, y + height - radius, radius, Math.PI / 2, Math.PI, false);
        if (close)
            drawingContext.closePath();
    }
}
export class ImageDrawer {
    static drawImage(drawingContext, img, x, y, width, height) {
        let currentImgSize;
        switch (Object.getPrototypeOf(img)) {
            case ImageBitmap.prototype: {
                let imageMedia = img;
                currentImgSize = { width: imageMedia.width, height: imageMedia.height };
                break;
            }
            case HTMLCanvasElement.prototype: {
                let canvasMedia = img;
                currentImgSize = { width: canvasMedia.width, height: canvasMedia.height };
                break;
            }
            case HTMLImageElement.prototype: {
                let imageMedia = img;
                currentImgSize = { width: imageMedia.naturalWidth, height: imageMedia.naturalHeight };
                break;
            }
            default: {
                return;
            }
        }
        if (currentImgSize.width == 0 || currentImgSize.height == 0) {
            return {
                width: 0,
                height: 0,
                x, y
            };
        }
        height = height || (currentImgSize.height * width / currentImgSize.width);
        drawingContext.translate(x, y);
        drawingContext.scale(width / currentImgSize.width, height / currentImgSize.height);
        drawingContext.drawImage(img, 0, 0);
        drawingContext.scale(currentImgSize.width / width, currentImgSize.height / height);
        drawingContext.translate(-x, -y);
        return {
            width,
            height,
            x,
            y
        };
    }
    static paintImage(fakeDrawningContext, img, color) {
        let currentImgSize;
        if (img.tagName == "CANVAS") {
            let canvasMedia = img;
            currentImgSize = { width: canvasMedia.width, height: canvasMedia.height };
        }
        else {
            let imageMedia = img;
            currentImgSize = { width: imageMedia.naturalWidth, height: imageMedia.naturalHeight };
        }
        fakeDrawningContext.drawImage(img, 0, 0);
        fakeDrawningContext.globalCompositeOperation = "source-in";
        fakeDrawningContext.fillStyle = color.toStyle();
        fakeDrawningContext.fillRect(0, 0, currentImgSize.width, currentImgSize.height);
    }
}
export class Formatter {
    static toTimeString(seconds) {
        return `${seconds / 60 < 10 ? "0" : ""}${Math.floor(seconds / 60)}:${seconds % 60 < 10 ? "0" : ""}${Math.floor(seconds % 60)}`;
    }
}
export class RenderManager {
    static renderFunction;
    static canvasElement;
    static timeSinceRender = 0;
    static maximumWidth = 1920;
    static maximumHeight = 1080;
    static desiredFrameRate = 30;
    static currentFrameRate = 30;
    static canvasBind(canvasElement) {
        RenderManager.canvasElement = canvasElement;
    }
    static renderBind(renderFunction) {
        RenderManager.renderFunction = renderFunction;
    }
    static updateCanvas() {
        if (RenderManager.canvasElement) {
            let maxWidth = window.innerWidth;
            let maxHeight = window.innerHeight;
            RenderManager.canvasElement.width = maxWidth;
            RenderManager.canvasElement.height = maxHeight;
            RenderManager.maximumWidth = maxWidth;
            RenderManager.maximumHeight = maxHeight;
        }
    }
    static init() {
        function prerender(timeStamp) {
            let desiredTimeDelta = 1000 / RenderManager.desiredFrameRate;
            if (timeStamp - RenderManager.timeSinceRender > desiredTimeDelta) {
                let deltaTime = timeStamp - RenderManager.timeSinceRender;
                RenderManager.currentFrameRate = 1000 / (deltaTime);
                RenderManager.timeSinceRender = timeStamp;
                if (RenderManager.renderFunction)
                    RenderManager.renderFunction({
                        width: RenderManager.maximumWidth,
                        height: RenderManager.maximumHeight,
                        timeSinceStartRender: timeStamp,
                        deltaTime
                    });
                requestAnimationFrame(prerender);
            }
        }
        ;
        requestAnimationFrame(prerender);
    }
}
//# sourceMappingURL=art.mjs.map