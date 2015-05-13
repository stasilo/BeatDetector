/*
 * BeatDetector.js
 * written by Jakob Stasilowicz
 *
 * kontakt [at] stasilo.se
 *
 * A pretty rudimentary but working beat detector. Built using the Web audio api. 
 * Based on comparing average shift in freq amplitudes in a current sample to a sample history.
 * Catches heavy beat hits pretty accurately (techno, house, hip hop, that kinda stuff)
 */

//set up name space

if (typeof stasilo == 'undefined')
{
	stasilo = {};
}


(function()
{
	// create audio context 
	// one per document/page!! 	

	var context = null; 

	try 
	{ 
		context = new ( window.AudioContext || window.webkitAudioContext )();
	} 
	catch(e) 
	{ 
	    alert('Sorry, the web audio api is not supported by your browser!'); 
	} 

	// constructor

	this.BeatDetector = function(settings) 
	{
		if( !(this instanceof stasilo.BeatDetector) )
		{
			return new BeatDetector(settings);
		}

		//globals 
		this.historyBuffer = [];
		this.instantEnergy = 0;
		this.prevTime = 0;
		this.bpmTable = [];

		this.bpm = {time: 0, counter: 0};

		this.startTime = 0, this.startOffset = 0;
		this.settings = settings; 

		// check if song download is in progress
		this.loading = false; 

	    // create analyzer node
	    this.analyser = context.createAnalyser();
	    this.visualizer = context.createAnalyser();

		this.visualizer.fftSize = (settings.visualizerFFTSize ? settings.visualizerFFTSize : 256); 
		this.analyser.fftSize = (settings.analyserFFTSize ? settings.analyserFFTSize : 256); 

	   /*
		* 44100 hertz á 16 bit = 
		* each sample is 16 bits and is taken 44100 times a second
		* for each second: 16 * 44100 bits = 705600 bits = 88200 = 44100 * 2 bytes per second of audio (stereo)
		*
		* The fft in web audio seems to analyze 1024 samples each call =>
		* 43 * 1024 = 44032 
		*
		* This means we have to call getByteFrequencyData() 43 times, thus receiving a MAX_COLLECT_SIZE
		* of 43 * 128 = 5504 for 1s of audio (in case fft = 256) in the historyBuffer or 
		* 43 * (fftSize / 2) = MAX_COLLECT_SIZE for a variable fft size.
		*/

		this.MAX_COLLECT_SIZE = 43 * (this.analyser.fftSize / 2);
		this.COLLECT_SIZE = 1;

		//sensitivity of detection
		this.sens = 1 + (settings.sens ? settings.sens / 100 : 0.05);  


		//microphone 
		navigator.getUserMedia  =	navigator.getUserMedia ||
	                        		navigator.webkitGetUserMedia ||
	                          		navigator.mozGetUserMedia ||
	                          		navigator.msGetUserMedia; 

	    this.bufferLength = this.analyser.frequencyBinCount;	

		//create empty historybuffer
		for(i = 0; this.historyBuffer.length < this.MAX_COLLECT_SIZE - this.COLLECT_SIZE - 1; i++)
		{
			this.historyBuffer.push(1);
		}

	    // create low pass bandpassFilter node
	    // used to isolate freq spectrum for beat detection
	    // optional 

		this.bandpassFilter = context.createBiquadFilter();

		this.bandpassFilter.type = (typeof this.bandpassFilter.type === 'string') ? 'bandpass' : 2; 
		this.bandpassFilter.frequency.value = (settings.passFreq ? settings.passFreq : 400); 
		this.bandpassFilter.Q.value = 0.5; 

		// create gain node
		this.gainNode = (context.createGain() || context.createGainNode());

		var self = this; // for later async access 

	    if(settings.url) // url supplied as soundsource 
	    {
		    // load the sound
	    	this.soundSource = context.createBufferSource();

	    	// don't use $.ajax() to keep beatdetector dependency free (even of jquery)
	 	    var request = new XMLHttpRequest();

	 	    this.loading = true; 
		    request.open("GET", settings.url, true);
		    request.responseType = "arraybuffer";


		    //send progress info to callback if avail.
		    if (typeof this.settings.progress == 'function') 
			{ 
			    request.addEventListener("progress", function(e) 
			    {
			    	var percent = 0; 

					if ( e.lengthComputable ) 
					{
						 percent = ( e.loaded / e.total ) * 100;

					}

					settings.progress( {percent: percent, complete: false} ); 

			    }, false);

			    //tell when complete
			    request.addEventListener("load", function(e)
			    {
			    	settings.progress({percent: 100, complete: true});

			    }, false);
			}

		    // this loads asynchronously

		    request.onload = function() 
		    {
		        var audioData = request.response;

			    // add buffer to sound source
				context.decodeAudioData(audioData, 
				function(buffer)
				{
			    	self.soundSource.buffer = self.soundBuffer = buffer;

			    	//save length of buffer
			        self.currentDuration = self.soundBuffer.duration; 
			        //self.soundSource.loop = true;

			        self.loading = false;
			        self.startTime = context.currentTime;

				},

				function(e) 
				{
					alert("Error decoding audio data");
					
					console.log(e);
				});	
		    };

		    request.send();

			// Connect analyser and context to source 
	   		// source -> bandpassFilter -> analyse -> gain -> destination

	    	this.connectGraph(); 


	    	this.soundSource.start ? this.soundSource.start(0) : this.soundSource.noteOn(0);
		} 
		else //microphone as soundsource
		{		
		    function gotStream(stream)
		    {
				self.soundSource = context.createMediaStreamSource(stream);

				self.soundSource.connect(self.analyser);
				self.soundSource.connect(self.visualizer);

				self.soundSource.connect(self.gainNode);

				self.gainNode.connect(context.destination);	

				self.micStream = stream; 		
			}

		    navigator.getUserMedia(
	        {
	            "audio": 
	            {
	                "mandatory": 
	                {
	                    "googEchoCancellation": "false",
	                    "googAutoGainControl": "false",
	                    "googNoiseSuppression": "false",
	                    "googHighpassFilter": "false"
	                },

	                "optional": []
	            },

	        }, gotStream, 
	        function(e) 
	        {
	            alert('Error getting microphone audio');
	            console.log(e);
	    	});		
		}
	}


	//methods 

	this.BeatDetector.prototype = 
	{
		setVolume: function(volume)
		{
	  		this.gainNode.gain.value = volume * volume;
	  	},

	  	getVolume: function()
	  	{
	  		return this.gainNode.gain.value; 
	  	},

		pause: function()
		{
			//check if running from url 
			if(this.soundSource.playbackState === this.soundSource.PLAYING_STATE)
			{			
				this.soundSource.stop(0);

				// measure how much time passed since the last pause/stop.
				this.startOffset += (context.currentTime - this.startTime);
			}
			else if(typeof this.micStream !== 'undefined') //or mic
			{
				this.micStream.stop(); 
			}
		},


		play: function(offset)
		{
			// fast forward or rewind if offset is supplied 
			
			this.startOffset += offset;

			if(this.startOffset < 0) 
			{
				this.startOffset = 0; 
			}

			this.soundSource = context.createBufferSource();
			this.soundSource.buffer = this.soundBuffer;

			this.connectGraph(); 

			// start playback, but make sure we stay in bound of the buffer.

			this.soundSource.start(0, (this.startOffset) % this.soundBuffer.duration);
			this.startTime = context.currentTime;

			//this.startOffset += (context.currentTime + offset - this.startTime);
		},

		isFinished: function(offset)
		{

			var dur = ((this.currentDuration === "undefined") ? 0 : this.currentDuration); 

			if( this.getElapsedTime() >= dur && dur != 0) //played whole buffer
			{
				if(this.soundSource.playbackState === this.soundSource.PLAYING_STATE)
				{
					this.soundSource.stop(0);

					//run callback if supplied
					if (typeof this.settings.playbackFinished == 'function') 
					{ 
						this.settings.playbackFinished();
					}
				}

				return true; 
			}
		},

		// Connect audio graph points
		connectGraph: function()
		{
			//this.soundSource.buffer = this.soundBuffer;

			//this.soundSource.loop = true;
			//this.soundSource.connect(context.destination);

			if(this.settings.passFreq) 
	    	{
	    		this.soundSource.connect(this.bandpassFilter);
	    		this.bandpassFilter.connect(this.analyser);

	    		console.log("Using bandpass filter");
	    	}
	    	else
	    	{
	    		this.soundSource.connect(this.analyser);
	    	}
	    		
	    	this.soundSource.connect(this.visualizer);
	    	this.soundSource.connect(this.gainNode);
	    	//bandpassFilter.connect(gainNode);

	    	this.gainNode.connect(context.destination);
	    	//this.gainNode.connect(this.visualizer);	

		},

		/* 
		 * Call his from the main render loop. Returns true if song is on a peak/beat, 
		 * false otherwise.
		 */

		isOnBeat: function() 
		{
			var localAverageEnergy = 0;
			var instantCounter = 0; 		
			var isBeat = false; 

			var bpmArray = new Uint8Array(this.bufferLength);
	  		this.analyser.getByteFrequencyData(bpmArray); //size = 128 * [0, 256](?)

	  		// check if audio has finished playing
	  		this.isFinished();

	  		// fill history buffer 
			for(var i = 0; i < bpmArray.length - 1; i++, ++instantCounter)
			{
				this.historyBuffer.push(bpmArray[i]);  //add sample to historyBuffer

				this.instantEnergy += bpmArray[i]; 
			}

			//done collecting MAX_COLLECT_SIZE history samples 
			//have COLLECT_SIZE nr of samples as instant energy value

			if(instantCounter > this.COLLECT_SIZE - 1  && 
				this.historyBuffer.length > this.MAX_COLLECT_SIZE - 1)
			{
				this.instantEnergy = this.instantEnergy / (this.COLLECT_SIZE * (this.analyser.fftSize / 2));

				var average = 0;
				for(var i = 0; i < this.historyBuffer.length - 1; i++)
				{
					average += this.historyBuffer[i]; 
				}

				localAverageEnergy = average/this.historyBuffer.length;

				var timeDiff = context.currentTime - this.prevTime;

				// timeDiff > 2 is out of normal song bpm range, but if it is a multiple of range [0.3, 1.5] 
				// we probably have missed a beat before but now have a match in the bpm table.
				
				if(timeDiff > 2 && this.bpmTable.length > 0)
				{
					//console.log("timediff is now greater than 3");

					//check if we have a multiple of range in bpm table

					for(var j = 0; j < this.bpmTable.length - 1; j++)
					{
						// mutiply by 10 to avoid float rounding errors
						var timeDiffInteger = Math.round( (timeDiff / this.bpmTable[j]['time']) * 1000 );

						// timeDiffInteger should now be a multiple of a number in range [3, 15] 
						// if we have a match

						if(timeDiffInteger % (Math.round(this.bpmTable[j]['time']) * 1000) == 0)
						{
							timeDiff = new Number(this.bpmTable[j]['time']); 
							//console.log("TIMEDIFF MULTIPLE MATCH: " + timeDiff);
						}
					}				
				}
				

				//still?
				if(timeDiff > 3)
				{
					this.prevTime = timeDiff = 0; 

				}
						
				////////////////////////
				// MAIN BPM HIT CHECK //
				////////////////////////

				// CHECK IF WE HAVE A BEAT BETWEEN 200 AND 40 BPM (every 0.29 to 2s), or else ignore it.
				// Also check if we have _any_ found prev beats

				if( context.currentTime > 0.29 && this.instantEnergy > localAverageEnergy &&
					( this.instantEnergy > (this.sens * localAverageEnergy) )  && 
				  	( ( timeDiff < 2.0  && timeDiff > 0.29 ) || this.prevTime == 0  ) )
				{

					isBeat = true; 

					this.prevTime = context.currentTime;

					this.bpm = 
					{
							time: timeDiff.toFixed(3),
							counter: 1,
					};


					for(var j = 0; j < this.bpmTable.length; j++)
					{
						//FOUND ANOTHER MATCH FOR ALREADY GUESSED BEAT

						if(this.bpmTable[j]['time'] == this.bpm['time'])
						{
							this.bpmTable[j]['counter']++;
							this.bpm = 0;

							if(this.bpmTable[j]['counter'] > 3 && j < 2)
							{		      
								console.log("WE HAVE A BEAT MATCH IN TABLE!!!!!!!!!!");
							}

							break;
						} 
					}

					if(this.bpm != 0 || this.bpmTable.length == 0)
					{
						this.bpmTable.push(this.bpm);
					}

					//sort and draw 10 most current bpm-guesses
					this.bpmTable.sort(function(a, b)
					{
						return b['counter'] - a['counter']; //descending sort
					});			
				} 

				var temp = this.historyBuffer.slice(0); //get copy of buffer

				this.historyBuffer = []; //clear buffer

				// make room in array by deleting the last COLLECT_SIZE samples.
				this.historyBuffer = temp.slice(this.COLLECT_SIZE * (this.analyser.fftSize / 2), temp.length);						

				instantCounter = 0;
				this.instantEnergy = 0; 

				localAverageEnergy = 0;

			}


			this.debug = ""; 

			for(i = 0; i < 10; i++)
			{
				if(i >= this.bpmTable.length)
					break;

				this.debug += ('Beat ' + i + ': ' + this.bpmTable[i]['time'] + ', counter: ' + this.bpmTable[i]['counter'] + ', calc. bpm: ' + Math.round(60/this.bpmTable[i]['time']) + '<br>');
			}

			this.debug += ( "history buffer size: " + this.historyBuffer.length + "<br>"); 
			this.debug += ( "instant energy: " + this.instantEnergy  + "<br>"); 
			this.debug += ( "local energy: " + localAverageEnergy  + "<br>"); 

			this.debug += ( "bpmArray size: " + bpmArray.length + "<br>");
			this.debug += "sensitivity: " + ( (this.sens - 1) * 100 ).toFixed(2) + "<br>";
		    
	  		return isBeat; 
		},

		getAudioFreqData: function()
		{
			var dataArray = new Uint8Array(this.bufferLength);

			this.visualizer.getByteFrequencyData(dataArray);

			return dataArray; 
		},

		getTimeDomainData: function()
		{
			var dataArray = new Uint8Array(this.bufferLength);
			
			this.visualizer.getByteTimeDomainData(dataArray);	

			return dataArray; 
		},	

		//duration of the current sample 
		getDuration: function()
		{
			return (typeof this.soundBuffer === 'undefined' ) ? 0 : this.soundBuffer.duration; 
		},

		getElapsedTime: function()
		{
			return ( context.currentTime + this.startOffset - this.startTime ); 
		},

		getDebugData: function()
		{
			return this.debug;  
		},

		getFileName: function()
		{
			var name = this.settings.url.split("/");

			return name[name.length - 1];
		},

		getBPMGuess: function()
		{
			var guesses = allGuesses = 0;
			var counter = 0; 	
				
			if(this.bpmTable.length <= 2)
			{
				return -1; 
			}

			for(var i = 0; i < this.bpmTable.length; i++)
			{
				allGuesses += (new Number(this.bpmTable[i]['time'])); 

				if(this.bpmTable[i]['counter'] > 1)
				{
					guesses += (new Number(this.bpmTable[i]['time'])); 

					counter++; 
				}
			}

			//i have no idea i don't even....
			return 	{ conservative: 	Math.round( 60 / (guesses/counter) ),
					  all: 				Math.round( 60 / (allGuesses/this.bpmTable.length) ) };

		}
	};
}).call(stasilo);
