import { DBusInterface, getBus, registerService } from "dbus";
import { SpotifyState } from "./classes";

const bus = getBus("session");

// registerService("session", "dev.jades.MusicVisualizer2-0");

let spotifyInterface: DBusInterface;

export function connect(){
    return new Promise<void>((accept)=>{
        console.log("Attempting to get interface...");
        bus.getInterface("org.mpris.MediaPlayer2.spotify", "/org/mpris/MediaPlayer2", "org.mpris.MediaPlayer2.Player", function(err, interf){
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
        spotifyInterface.Seek((position - currentSpotifyState.timePosition) * 1000000);
    })
}

export function fetchCurrentSpotifyState(){
    return new Promise<SpotifyState>((accept)=>{
        let completedTask = 0;

        let completeTask = function(){
            completedTask ++;
            if (completedTask == 4){
                return accept(currentSpotifyState);
            };
        };

        spotifyInterface.getProperty("Metadata", (err, data: any)=>{
            if (err)
                console.error(err);
            currentSpotifyState.timeFeteched = Date.now();
            currentSpotifyState.volume = 0;
            currentSpotifyState.spotifyID = data["mpris:trackid"];
            currentSpotifyState.timeLength = data["mpris:length"] / 1000000;
            currentSpotifyState.artworkURL = data["mpris:artUrl"];
            currentSpotifyState.albumName = data["xesam:album"];
            currentSpotifyState.artistName = (data["xesam:artist"] as string[]).join(" & ");
            currentSpotifyState.trackNumber = data["xesam:trackNumber"];
            currentSpotifyState.trackName = data["xesam:title"];
            currentSpotifyState.popularity = data["xesam:autoRating"];
            completeTask();
        });
        
        spotifyInterface.getProperty("Position", (err, data: any)=>{
            if (err)
                console.error(err);
            currentSpotifyState.timePosition = data / 1000000;
            completeTask();
        });
        
        spotifyInterface.getProperty("PlaybackStatus", (err, data: any)=>{
            if (err)
                console.error(err);
            currentSpotifyState.playState = data == "Playing";
            completeTask();
        });
        
        spotifyInterface.getProperty("Volume", (err, data: any)=>{
            if (err)
                console.error(err);
            currentSpotifyState.volume = data;
            completeTask();
        });
    });
}



connect();