BeatDetector.js
written by Jakob Stasilowicz

kontakt [at] stasilo.se
 
A pretty rudimentary but working beat detector. Built using the Web audio api. 
Based on comparing average shift in freq amplitudes in a current sample to a sample history.
Catches heavy beat hits pretty accurately (techno, house, hip hop, that kinda stuff)
 
BPM calculation funcionality mostly for kicks: don't use it for anything exact, there are
far better options. 
 
Based on the frequency select-algorithm (the web audio api does fft-calculations for us) but without band splitting from: 

http://archive.gamedev.net/archive/reference/programming/features/beatdetection/index.html 

Usage: 
 
var song = new stasilo.BeatDetector( {sens:              5.0, 
                              		  visualizerFFTSize: 256, 
                              		  analyserFFTSize:   256,
                              		  passFreq:          600,
                              		  url:               "file.mp3"} ); 
Settings:

sens: 					Sensitivity of the algorithm - a value between 1 and 16 
						(1 - low threshold, 16 - high treshold) should do it. 
						Requires a bit of trail and error tweaking for the sweet spot. (required)

visualizerFFTSize		Size of fft calculation for visualizations (default: 256)
						Must be a power of two (2^7 = 128, 2^8 = 256, 2^9 = 512, ...)

analyserFFTSize			Size of fft calculation for the algorithm (default: 256) 
						Must be a power of two (2^7 = 128, 2^8 = 256, 2^9 = 512, ...)

passFreq				Float. If supplied, passes audio through a bandpass filter with a peak at this
						frequency before passing it on to the algorithm. Suitable for example when a song
						has a loud treble/mid section and you'd like to detect bass drum beats, 
						in which case a bandpass at 100-800Hz could help you out. (default: off)

						Freq chart for common instruments: 
						http://www.independentrecording.net/irn/resources/freqchart/main_display.htm

url						Url to audio file (detection defaults to microphone if no url is supplied)

loop					Boolean. Whether to loop the sound or not. Default: false. 

playbackFinished		A callback run at the end of playback.. 

progress(obj)			A callback run while sound is downloading from url. 
						An object of {percent: value, complete: boolean} is passed as an argument. 



To get frequency data for drawing bars and what not:

song.getAudioFreqData()

This returns an array of visualizerFFTSize/2 data values corresponding to frequency amplitudes.

To detect a beat hit:

Call song.isOnBeat() from the render loop of your script. 
Returns true if on a beat. 
 
For everything else: rtfs.
