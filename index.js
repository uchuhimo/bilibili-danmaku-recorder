const {KeepLiveTCP} = require('bilibili-live-ws');
const EventEmitter = require('events');
const fs = require('fs');
const express = require('express');
const app = express();
const config = require('./config');
let currentLive = new Map();

app.get('/api/live', function (req, res) {
    const roomId = parseInt(req.query.roomId);
    const status = parseInt(req.query.status);
    const filename = req.query.filename;
    if (roomId && filename) {
        console.log(roomId + ': ' + status);
        watch({roomId, status, filename});
        res.send({'msg': 1});
    }
});
app.listen(config.ExpressPort, function () {
    console.log(`listening on port ${config.ExpressPort}!`);
});
const watch = ({roomId, status, filename}) => {
    if (!currentLive[roomId] && status === 1) {
        new LiveEvent(roomId, filename).emit('start');
    }
    currentLive[roomId] = status;
};

class LiveEvent extends EventEmitter {
    constructor(roomId, filename) {
        super();

        this.roomId = roomId;
        this.live = new KeepLiveTCP(roomId);
        this.startTime = Date.now();

        this.count = 0;
        this.prevTime = "";
        this.prevText = "";

        this.path = `${config.DownloadDir}/${filename}`;
        this.txtFile = fs.createWriteStream(this.path, {flags: 'a+'});
        this.srtFile = fs.createWriteStream(this.path.split('.txt')[0] + '.srt', {flags: 'a+'});

        this.watch();
        this.on('start', () => {
            this.monitor(this.roomId);
        });
        this.on('close', () => {
            this.writeSubtitle(null);
            this.writePlainText(null);
            this.live.close();
        })
    }

    writeSubtitle(text) {
        let lastTime = Date.now() - this.startTime;
        let h = Math.floor(lastTime / 1000 / 60 / 60);
        let m = Math.floor(lastTime / 1000 / 60 % 60);
        let s = Math.floor(lastTime / 1000 % 60);
        let ms = Math.floor(lastTime % 1000);

        let t1 = (time) => ((time < 10) ? '0' : '') + time;
        let t2 = (time) => ((time < 10) ? '00' : (time < 100) ? '0' : '') + time;

        let now = `${t1(h)}:${t1(m)}:${t1(s)}.${t2(ms)}`;

        if (this.count !== 0) {
            try {
                this.srtFile.write(`${this.count}\n${this.prevTime} --> ${now}\n${this.prevText}\n`);
            } catch (e) {
                //pass
            }

        }
        this.count++;

        if (!text) {
            this.srtFile.close();
            return;
        }
        this.prevTime = now;
        this.prevText = text;
    }

    writePlainText(s) {
        if (!s) {
            this.txtFile.close();
            return
        }
        try {
            this.txtFile.write(s + "\n")
        } catch (e) {
            //pass
        }

    }

    monitor() {
        this.live.on('open', () => console.log(this.roomId + 'Connection is established'));
        this.live.on('DANMU_MSG', (data) => {
            let danmakuText = data['info'][1];
            console.log(danmakuText);
            let s = this.danmakuFilter(danmakuText);
            if (s) {
                this.writePlainText(s);
                this.writeSubtitle(s);
            }
        });
    };

    watch() {
        const _watch = () => {
            if (currentLive[this.roomId] === 0) {
                this.emit('close')
            } else {
                console.log(`KeepAlive ${this.roomId}`)
            }
            setTimeout(_watch, 3000)
        };
        setTimeout(_watch, 3000)
    };

    danmakuFilter(raw) {
        let leftPos = raw.indexOf("【");
        let rightPos = raw.indexOf("】");

        if (leftPos === -1 && rightPos === -1) return null;
        if (leftPos !== 0) raw = raw.replace("【", "：");

        return raw.replace("【", "").replace("】", "");
    }
}