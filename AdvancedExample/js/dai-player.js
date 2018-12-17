/*
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const PlaybackState = {
  LOAD: 'load',
  PLAY: 'play',
  PAUSE: 'pause',
  SEEK: 'seek'
}

const SeekDirection = {
  FORWARD: 1,
  REVERSE: -1
}

class DaiPlayer {
  constructor(videoElementId) {

    this.stream;

    this.backupStream = 'http://storage.googleapis.com/testtopbox-public/video_content/bbb/master.m3u8';

    this.playbackState = PlaybackState.LOAD;

    this.adStatus = 'N/A';

    this.disableSeek = false;

    this.seekDirection;

    this.seekPosition = 0;

    this.bookmarkForSnapback = 0;;

    this.video = document.getElementById(videoElementId);
    this.video.ontimeupdate = () => {
      this.ontimeupdate();
    }

    this.hls;

    this.streamManager;
  }

  initPlayer(selectedStream) {
    this.stream = selectedStream;
    this.disableSeek = false;

    if (this.streamManager != null) {
      this.streamManager.reset();
      this.streamManager = null;
    }

    if (this.hls != null) {
      this.hls.detachMedia();
      this.hls.destroy();
      this.hls = null;
    }

    const config = { debug: false };
    this.hls = new Hls(config);

    this.streamManager = new google.ima.dai.api.StreamManager(this.video);

    //Load the URL returned by the StreamRequest
    this.streamManager.addEventListener(google.ima.dai.api.StreamEvent.Type.LOADED, (event) => {
      const url = event.getStreamData().url;
      this.loadUrl(url);
    });

    //Load the backup stream if the stream request returns an error
    this.streamManager.addEventListener(google.ima.dai.api.StreamEvent.Type.ERROR, (event) => {
      this.loadUrl(this.backupStream);
    });

    //Disable seek when ad break starts
    this.streamManager.addEventListener(google.ima.dai.api.StreamEvent.Type.AD_BREAK_STARTED, (event) => {
      this.disableSeek = true;
    });

    //Enable seek and perform snapback (if necessary) when ad break ends
    this.streamManager.addEventListener(google.ima.dai.api.StreamEvent.Type.AD_BREAK_ENDED, (event) => {
      this.log('[DaiPlayer]\tSeek enabled');
      this.adStatus = 'N/A';
      this.disableSeek = false;
      if (this.bookmarkForSnapback) {
        this.log(`[DaiPlayer]\tSnapping back to bookmark at ${this.bookmarkForSnapback}`);
        this.video.currentTime = this.seekPosition;
        this.bookmarkForSnapback = 0;
      }
    });

    //Update adStatus for ad UI 
    this.streamManager.addEventListener(google.ima.dai.api.StreamEvent.Type.AD_PROGRESS, (adProgressEvent) => {
      const adProgressData = adProgressEvent.getStreamData().adProgressData;
      const currentAdNum = adProgressData.adPosition;
      const totalAds = adProgressData.totalAds;
      const currentTime = adProgressData.currentTime;
      const duration = adProgressData.duration;
      const remainingTime = Math.floor(duration - currentTime);
      this.adStatus = `${currentAdNum} of ${totalAds}: ${remainingTime} seconds`;
    });

    //Log each event to the console for debugging
    this.streamManager.addEventListener(
      [google.ima.dai.api.StreamEvent.Type.LOADED,
      google.ima.dai.api.StreamEvent.Type.ERROR,
      google.ima.dai.api.StreamEvent.Type.STARTED,
      google.ima.dai.api.StreamEvent.Type.FIRST_QUARTILE,
      google.ima.dai.api.StreamEvent.Type.MIDPOINT,
      google.ima.dai.api.StreamEvent.Type.THIRD_QUARTILE,
      google.ima.dai.api.StreamEvent.Type.COMPLETE,
      google.ima.dai.api.StreamEvent.Type.AD_BREAK_STARTED,
      google.ima.dai.api.StreamEvent.Type.AD_BREAK_ENDED],
      (event) => {
        this.log(`[IMA SDK]\tEvent: ${event.type}`);
      });

    // Add metadata listener. Only used in LIVE streams. Timed metadata
    // is handled differently by different video players, and the IMA SDK provides
    // two ways to pass in metadata, StreamManager.processMetadata() and
    // StreamManager.onTimedMetadata().
    //
    // Use StreamManager.onTimedMetadata() if your video player parses
    // the metadata itself.
    // Use StreamManager.processMetadata() if your video player provides raw
    // ID3 tags, as with hls.js.
    this.hls.on(Hls.Events.FRAG_PARSING_METADATA, (event, data) => {
      if (this.streamManager && data) {
        // For each ID3 tag in our metadata, we pass in the type - ID3, the
        // tag data (a byte array), and the presentation timestamp (PTS).
        data.samples.forEach((sample) => {
          this.streamManager.processMetadata('ID3', sample.data, sample.pts);
        });
      }
    });

    if (selectedStream.type == "live") {
      this.requestLiveStream(selectedStream.assetkey, selectedStream.apikey);
    } else if (selectedStream.type == "vod") {
      this.requestVODStream(selectedStream.cmsid, selectedStream.vid, selectedStream.apikey);
    }

    this.onstreaminit();
  }

  /**
    * Requests a Live stream with ads.
    * @param  {string} assetKey
    * @param  {?string} apiKey
    **/
  requestLiveStream(assetKey, apiKey) {
    const streamRequest = new google.ima.dai.api.LiveStreamRequest();
    streamRequest.assetKey = assetKey;
    streamRequest.apiKey = apiKey || '';
    this.streamManager.requestStream(streamRequest);
    this.log(`[DaiPlayer]\tLive stream requested with asset key ${assetKey}`);
  }

  /**
   * Requests a VOD stream with ads.
   * @param  {string} cmsId
   * @param  {string} videoId
   * @param  {?string} apiKey
   * */
  requestVODStream(cmsId, videoId, apiKey) {
    const streamRequest = new google.ima.dai.api.VODStreamRequest();
    streamRequest.contentSourceId = cmsId;
    streamRequest.videoId = videoId;
    streamRequest.apiKey = apiKey;
    this.streamManager.requestStream(streamRequest);
    this.log(`[DaiPlayer]\tVOD stream requested with CMS ID ${cmsId} & VID ${videoId}`);

  }

  loadUrl(url) {
    this.hls.loadSource(url);
    this.hls.attachMedia(this.video);
    this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
      this.play();
    });
  }

  pause() {
    this.video.pause();
    this.updatePlaybackState(PlaybackState.PAUSE);
  }

  play() {
    this.video.play();
    this.updatePlaybackState(PlaybackState.PLAY);
  }

  /**
    * Begin seek in the specified direction
    * @param  {number} direction
    **/
  seek(direction) {
    if (this.disableSeek) return;

    this.seekDirection = direction;

    if (this.playbackState !== PlaybackState.SEEK) {
      this.video.pause();
      this.updatePlaybackState(PlaybackState.SEEK);
      this.seekPosition = this.video.currentTime;
      const seek = setInterval(() => {
        if (this.playbackState === PlaybackState.SEEK) {
          this.seekPosition += (2 * this.seekDirection);
          this.ontimeupdate();
        } else {
          clearInterval(seek);
          this.seekTo(this.seekPosition);
          this.seekPosition = 0;
        }
      }, 200)
    }
  }

  /**
   * Seek playhead to a specific time and perform snapback
   * Does nothing is SEEK is active
   * @param {number} time
   * @memberof DaiPlayer
   */
  seekTo(time) {
    if (!this.disableSeek && this.playbackState !== PlaybackState.SEEK) {
      this.video.currentTime = time;
      this.snapback(time);
    }
  }

  snapback(time) {
    const previousCuePoint = this.streamManager.previousCuePointForStreamTime(time);
    if (previousCuePoint && !previousCuePoint.played) {
      this.video.currentTime = previousCuePoint.start;
      this.log(`[DaiPlayer]\tSnapping back to start of previous cue point ${previousCuePoint.start}`);
      //Save a bookmark to return to after the ad break 
      if (time > previousCuePoint.end) {
        this.bookmarkForSnapback = time;
        this.log(`[DaiPlayer]\tSaving bookmark for snapback at ${this.bookmarkForSnapback}`);
      }
    }
  }

  updatePlaybackState(newState) {
    this.playbackState = newState;
    this.onstatechanged();
  }

  toggleSubtitles() {
    if (this.video.textTracks.length != 0) {
      const subtitlesDisplayed = this.video.textTracks[0].mode == 'showing';
      this.video.textTracks[0].mode = (subtitlesDisplayed) ? 'hidden' : 'showing';
    }
  }

  getCurrentTime() {
    return (this.playbackState === PlaybackState.SEEK) ? this.seekPosition : this.video.currentTime;
  }

  getMinTime() {
    const liveMin = this.video.duration - this.hls.liveSyncPosition;
    return (this.hls.liveSyncPosition) ? liveMin : 0;
  }

  getMaxTime() {
    return this.hls.liveSyncPosition || this.video.duration;
  }

  getSubtitleStatus() {
    if (this.video.textTracks.length != 0) {
      return this.video.textTracks[0].mode;
    } else {
      return 'N/A';
    }
  }

  onstreaminit() { }

  onstatechanged() { }

  ontimeupdate() { }

  log(msg) { }

}




