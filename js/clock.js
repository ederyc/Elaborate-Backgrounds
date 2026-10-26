/*
  The stepped clock. Rendering runs at the display's rate, but anything that
  animates reads its time from here, and that time only moves on the
  stop-motion beat (12, 8 or 6 times a second). Between beats the pose holds,
  the way a stop-motion frame holds on screen for 2, 3 or 4 video frames.

  Every animation period is a whole fraction of LOOP seconds, and boil cycles
  through a few fixed seeds, so the whole scene repeats exactly every LOOP
  seconds at any of the three rates. That's what makes a seamless video loop
  possible later.
*/
(function () {
  const LB = (window.LB = window.LB || {});

  const LOOP = 6; // seconds; 72, 48 or 36 beats
  const BOIL_SEEDS = 3; // like redrawing every drawing three times and cycling them

  function createClock(fps) {
    let seconds = 0; // play time, frozen while paused
    return {
      fps,
      get loop() { return LOOP; },
      advance(dt) { seconds = (seconds + dt) % LOOP; },
      set(t) { seconds = ((t % LOOP) + LOOP) % LOOP; },
      get seconds() { return seconds; },
      // The beat index within the loop and the quantized time it stands for.
      get beat() { return Math.floor(seconds * this.fps + 1e-6); },
      get beatTime() { return this.beat / this.fps; },
      get boilSeed() { return this.beat % BOIL_SEEDS; },
    };
  }

  LB.createClock = createClock;
  LB.LOOP = LOOP;
  LB.BOIL_SEEDS = BOIL_SEEDS;
})();
