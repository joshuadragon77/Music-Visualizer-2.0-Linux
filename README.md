![Demo](https://github.com/joshuadragon77/Music-Visualizer-2.0-Linux/blob/main/Clip.gif?raw=true))

Above is a demo using the recent release of "playaslaya" from "in the bittersweet of time" by Astrale. Check em out here: https://astralemusic.com/ :)

<img width=100px src="https://github.com/joshuadragon77/Music-Visualizer-2.0-Linux/blob/main/resources/icons/icon.png?raw=true">


# Music Visualizer 2.0 (Ported for Linux)

Originally a macOS NodeJS application that can be viewed by any web browser. It shows the fourier transform waves of the song, the lyrics and other nice visuals in all CanvasContext2D rendering framework all programmed by me (minus the cava part). 

## Features

- It uses the binary execute cava to get audio input from alsa and gets its fourier transform data to display to the visualizer.
- Uses my own Lyrics File called "Jade Lyrics" which store the lyrics of a song and how it should be displayed in a timely fashion, down to the words.
- Features "Dynamic Colours" which is a simple machine learnt algorithm that picks the right colour out of the album image and uses it customize the looks of the visualizer
- Spotify Audio Control through DBUS. You can go to the previous song, next song, pause/play the song and seek song all through the web app.

There are many features missing such Lyrics Generation because I didn't plan to have it all ready thanks to school. Let me know if you have any questions. 

I have a Jade Lyrics Repository which goes up to "710 files". But won't put in this repository due to uh... respect to posting intellectual property.

## Instructions

Run `initialstart.sh` in your shell of the root directory of this repository.

Then.. everytime you need to run the app. Run `start.sh` everytime.

View the visualizer in your web browser by accessing `http://localhost:38495` or `http://<insert your pc hostname here>:38495`

`insert your pc hostname here` being the the value you get from executing `hostname` into your shell.

You might need easyeffect delay by +200ms to compensate for the audio visualizing delay on the visualizer. It's due to the nature of many middlemans involving in data transmission. 

## Story

It was originally intended for macOS and uses Apple Script to interface with the Spotify App. 
It also originally used my own DFT engine java executable than cava to perform discrete fourirer transform on the input audio. 

The other versions utilized native Java entirely and AJK Render Engine which was developed by me and my high school friends. :)

I went to commit this and push this because I need some reference I made cool projects. not a noob who hides cool things.

## Controls
Left Arrow - Previous Track <br>
Right Arrow - Previous Track <br>
Space - Pause/Play <br>

## Dependencies
You will need to install **typescript** to build the application to get the javascript files.

You will need **NodeJS** for obvious reasons, it is the main program that executes this app.


## Jade Lyrics
There is a Python File I will provide that will allow you to generate Jade Lyrics file given a track you are playing manually in the background.

If you are interested in generating Jade Lyrics files for my Music Visualizer Program! I have solution for you, you will need to use this Legacy Java App. :) It's ported from macOS to Linux and I fixed a few things. It's a bit scuffed and is only ready enough for generating Lyrics.
https://github.com/joshuadragon77/Music-Visualizer-Legacy-Linux

## My Module Dependencies

If you look through the code, you may notice I have some of my own module. I have made my own communication, databasing and render framework to learn a little bit more about how they work. And for good sake, I know you should avoid doing it because you suck and there is always better ways to do them. I'm saying, don't re-invent the wheel. 

Anyways...
JadeStruct served as a way to make Object Serialization smaller. It serves to replace JSON.
JadeDB served as a way to store data in an array structure. It serves to replace... well my inability to learn Databasing. It's also hella complicated and uses EPointers (my own term for allocation table) and can be corrupted if not saved right.
JadeTransmission served as a way to manage two communication over websocket better.
