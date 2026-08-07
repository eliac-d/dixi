const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

class ProcessQueue {
  constructor(concurrency = 2) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  push(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.next();
    });
  }

  next() {
    if (this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }

    this.running++;
    const { task, resolve, reject } = this.queue.shift();

    task()
      .then(resolve)
      .catch(reject)
      .finally(() => {
        this.running--;
        this.next();
      });
  }
}

const ffmpegQueue = new ProcessQueue(2);

function runFFmpeg(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-vcodec', 'libwebp',
      '-filter:v', 'scale=512:512:force_original_aspect_ratio=decrease,fps=15',
      '-lossless', '0',
      '-compression_level', '4',
      '-q:v', '60',
      '-loop', '0',
      '-preset', 'default',
      '-an',
      '-vsync', '0',
      '-y',
      outputPath
    ];

    const ffmpegProcess = spawn('ffmpeg', args);

    ffmpegProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg finalizó con código: ${code}`));
      }
    });

    ffmpegProcess.on('error', (err) => {
      reject(err);
    });
  });
}

app.post('/process-video', async (req, res) => {
  const { inputUrl } = req.body;

  if (!inputUrl) {
    return res.status(400).json({ error: 'Falta el parámetro inputUrl' });
  }

  const id = Date.now();
  const tempInput = path.join(__dirname, `temp_in_${id}`);
  const tempOutput = path.join(__dirname, `temp_out_${id}.webp`);

  try {
    const response = await fetch(inputUrl);
    if (!response.ok) throw new Error('No se pudo descargar el archivo fuente');
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(tempInput, Buffer.from(buffer));

    await ffmpegQueue.push(() => runFFmpeg(tempInput, tempOutput));

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    const stream = fs.createReadStream(tempOutput);
    stream.pipe(res);

    stream.on('end', () => {
      if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
      if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);
    });

  } catch (error) {
    if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
    if (fs.existsSync(tempOutput)) fs.unlinkSync(tempOutput);

    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor activo en el puerto ${PORT}`);
});
