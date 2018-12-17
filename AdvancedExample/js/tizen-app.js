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

class TizenApp {
  constructor() {
    this.isTizen = (typeof tizen !== 'undefined');

    this.streamMenu = new StreamMenu('menu');

    this.seekBar = document.getElementById("seek-bar");

    this.daiPlayer = new DaiPlayer('video');

    this.daiPlayer.log = this.log;

    this.daiPlayer.onstreaminit = () => {
      const streamInfo = this.daiPlayer.stream;
      document.getElementById("title").textContent = streamInfo.title;
      document.getElementById("video-id").textContent = streamInfo.vid || 'N/A';
      document.getElementById("content-source-id").textContent = streamInfo.cmsid || 'N/A';
      document.getElementById("asset-key").textContent = streamInfo.assetkey || 'N/A';
    }

    this.daiPlayer.ontimeupdate = () => {
      document.getElementById("playback-time").textContent = this.formatPlaybackTime(this.daiPlayer.getCurrentTime());
      document.getElementById("seek-state").textContent = (!this.daiPlayer.disableSeek) ? 'enabled' : 'disabled';
      document.getElementById("ad-status").textContent = this.daiPlayer.adStatus;
      document.getElementById("caption-state").textContent = this.daiPlayer.getSubtitleStatus();

      this.seekBar.valueAsNumber = this.daiPlayer.getCurrentTime();
      this.seekBar.min = this.daiPlayer.getMinTime();
      this.seekBar.max = this.daiPlayer.getMaxTime();
    }

    this.daiPlayer.onstatechanged = () => {
      document.getElementById("playback-state").textContent = this.daiPlayer.playbackState;
      this.seekBar.style.visibility = (this.daiPlayer.playbackState == PlaybackState.SEEK) ? 'visible' : 'hidden';
    }

    this.bindUIActions();
  }

  bindUIActions() {
    this.keyList = {
      ENTER: 'Enter',
      BACK: 'XF86Back',
      SUBTITLES: 'ColorF2Yellow',
      PLAY: 'MediaPlay',
      PAUSE: 'MediaPause',
      FF: 'MediaFastForward',
      RW: 'MediaRewind'
    }

    if (this.isTizen) {
      //ENTER and BACK are registered by default
      tizen.tvinputdevice.registerKeyBatch(
        [this.keyList.SUBTITLES, this.keyList.PLAY, this.keyList.PAUSE, this.keyList.FF, this.keyList.RW]);
    } else {
      // tizen undefined means we are debugging on desktop
      // map the keys to a standard keyboard
      this.keyList.ENTER = 'Enter';
      this.keyList.BACK = 'Backspace';
      this.keyList.SUBTITLES = 'KeyI';
      this.keyList.PLAY = 'KeyP';
      this.keyList.PAUSE = 'KeyO';
      this.keyList.FF = 'KeyL';
      this.keyList.RW = 'KeyK';
    }

    document.addEventListener('keydown', this.onKeyPressed.bind(this), true);
  }

  onKeyPressed(event) {
    const key = (this.isTizen) ? event.keyIdentifier : event.code;
    this.log(`[TizenApp]\t${key} pressed`);
    switch (key) {

      case this.keyList.ENTER:
        if (this.streamMenu.isOpen()) {
          const stream = this.streamMenu.selectedItem();
          this.daiPlayer.initPlayer(stream);
          this.streamMenu.closeMenu();
        }
        break;

      case this.keyList.BACK:
        if (this.streamMenu.openMenu()) {
          this.daiPlayer.pause();
          event.preventDefault();
        }
        break;

      case this.keyList.PLAY:
        this.daiPlayer.play()
        break;

      case this.keyList.PAUSE:
        this.daiPlayer.pause();
        break;

      case this.keyList.FF:
        this.daiPlayer.seek(SeekDirection.FORWARD);
        break;

      case this.keyList.RW:
        this.daiPlayer.seek(SeekDirection.REVERSE);
        break;

      case this.keyList.SUBTITLES:
        this.daiPlayer.toggleSubtitles();
        break;
    }
  }

  log(msg) {
    const debug = document.getElementById("debug-container");
    if (debug) {
        const p = document.createElement("p");
        p.innerHTML = msg;
        debug.appendChild(p);
        debug.scrollTop = debug.scrollHeight;
    }
    console.log(msg);
  }

  formatPlaybackTime(seconds) {
    const date = new Date(null);
    date.setSeconds(seconds);
    return date.toISOString().substr(11, 8);
  }

}

class StreamMenu {
  constructor(menuId) {
    this.menu = document.getElementById(menuId);
    this.menu.style.display = 'inline';
  }

  openMenu() {
    if (this.isOpen()) return false;
    this.menu.style.display = 'inline';
    this.menu.focus();
    return true;
  }

  closeMenu() {
    if (!this.isOpen()) return false;
    this.menu.style.display = 'none';
    return true;
  }

  isOpen() {
    return (this.menu.style.display === 'inline');
  }

  selectedItem() {
    return this.menu.options[this.menu.selectedIndex].dataset;
  }

}

