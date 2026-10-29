/*
  A small MP4 writer for one H.264 video track, so exported loops can be
  frame-exact: every beat is rendered and encoded offline (WebCodecs), with
  its own timestamp, and then packed here. No library.

  The layout is the plain "fast start" one: ftyp, then moov (the index),
  then mdat (all the frames as one chunk). Each frame lasts the same time,
  so the timing table (stts) has a single entry, and a 6-second loop at
  12 beats a second is exactly 72 samples of 1/12 s.

  Box layouts follow ISO/IEC 14496-12 (the ISO base media file format) and
  14496-15 (the avcC box, which the encoder hands over ready-made).
*/
(function () {
  const LB = (window.LB = window.LB || {});

  const u8 = (v) => [v & 255];
  const u16 = (v) => [(v >> 8) & 255, v & 255];
  const u32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const str = (s) => [...s].map((c) => c.charCodeAt(0));
  const zeros = (n) => new Array(n).fill(0);

  // A box: 32-bit size, 4-character type, then its contents (arrays of bytes or Uint8Arrays).
  function box(type, ...parts) {
    const body = parts.map((p) => (p instanceof Uint8Array ? p : Uint8Array.from(p)));
    const size = 8 + body.reduce((n, b) => n + b.length, 0);
    const out = new Uint8Array(size);
    out.set([...u32(size), ...str(type)], 0);
    let at = 8;
    for (const b of body) { out.set(b, at); at += b.length; }
    return out;
  }
  // A "full box" adds a version byte and 24 bits of flags.
  const fullBox = (type, version, flags, ...parts) => box(type, [version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255], ...parts);
  const MATRIX = [...u32(0x00010000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x00010000), ...u32(0), ...u32(0), ...u32(0), ...u32(0x40000000)];

  // samples: [{ data: Uint8Array, key: boolean }] in order; each lasts "delta" in "timescale" units.
  function mux({ width, height, timescale, delta, avcC, samples }) {
    const n = samples.length;
    const duration = n * delta;
    const total = samples.reduce((s, x) => s + x.data.length, 0);

    const stbl = (chunkOffset) => box("stbl",
      fullBox("stsd", 0, 0, u32(1),
        box("avc1", zeros(6), u16(1), u16(0), u16(0), zeros(12), u16(width), u16(height),
          u32(0x00480000), u32(0x00480000), u32(0), u16(1), zeros(32), u16(0x0018), u16(0xffff),
          box("avcC", avcC))),
      fullBox("stts", 0, 0, u32(1), u32(n), u32(delta)),
      fullBox("stss", 0, 0, u32(samples.filter((s) => s.key).length), ...samples.map((s, i) => (s.key ? u32(i + 1) : [])).filter((a) => a.length)),
      fullBox("stsc", 0, 0, u32(1), u32(1), u32(n), u32(1)),
      fullBox("stsz", 0, 0, u32(0), u32(n), ...samples.map((s) => u32(s.data.length))),
      fullBox("stco", 0, 0, u32(1), u32(chunkOffset)));

    const moov = (chunkOffset) => box("moov",
      fullBox("mvhd", 0, 0, u32(0), u32(0), u32(timescale), u32(duration), u32(0x00010000), u16(0x0100), zeros(10), MATRIX, zeros(24), u32(2)),
      box("trak",
        fullBox("tkhd", 0, 3, u32(0), u32(0), u32(1), u32(0), u32(duration), zeros(8), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(width << 16), u32(height << 16)),
        box("mdia",
          fullBox("mdhd", 0, 0, u32(0), u32(0), u32(timescale), u32(duration), u16(0x55c4), u16(0)),
          fullBox("hdlr", 0, 0, u32(0), str("vide"), zeros(12), str("Video\0")),
          box("minf",
            fullBox("vmhd", 0, 1, zeros(8)),
            box("dinf", fullBox("dref", 0, 0, u32(1), fullBox("url ", 0, 1))),
            stbl(chunkOffset)))));

    const ftyp = box("ftyp", str("isom"), u32(512), str("isom"), str("iso2"), str("avc1"), str("mp41"));
    // The moov's size doesn't depend on the offset value, so measure it once, then write it for real.
    const moovSize = moov(0).length;
    const head = moov(ftyp.length + moovSize + 8);
    const mdatHead = Uint8Array.from([...u32(8 + total), ...str("mdat")]);
    return new Blob([ftyp, head, mdatHead, ...samples.map((s) => s.data)], { type: "video/mp4" });
  }

  LB.MP4 = { mux };
})();
