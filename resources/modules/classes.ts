
export type SpotifyState = {
    playState: boolean;
    localTrack: boolean;
    timePosition: number;
    timeLength: number;
    artistName: string;
    trackName: string;
    artworkURL: string;
    spotifyID: string;
    albumName: string;
    timeFeteched: number;
    popularity: number;
    trackNumber: number;
    volume: number;
}