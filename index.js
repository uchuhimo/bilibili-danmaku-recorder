const { KeepLiveTCP } = require('bilibili-live-ws');
const fs = require('fs');
const express = require('express');
const app = express();
let currentLive = new Map();

app.get('/api/live', function (req, res) {
    const roomId = parseInt(req.query.roomID);
    const status = parseInt(req.query.status);
    const path = req.query.filename;
    if (status == 1) {
        console.log(path);
        currentLive[roomId] = new LiveEvent(roomId, path);
        res.send({ 'msg': 1 });
    } else {
        currentLive[roomId].newPath = path;
        currentLive[roomId].live.close();
        delete currentLive[roomId];
        res.send({ 'msg': 0 });
    }
});
app.listen(3000);


class DanmaMessage {
    constructor({
        cmd,
        uid,
        username,
        message,
        guard,
        is_admin,
        type,
        fontSize,
        color,
        timestamp
    }) {
        this.cmd = cmd;
        this.uid = uid;
        this.username = username;
        this.message = message;
        this.guard = guard;
        this.is_admin = is_admin;
        this.type = type;
        this.fontSize = fontSize;
        this.color = color;
        this.timestamp = timestamp;
    }
}

function parseMessage(message) {
    switch (message["cmd"]) {
        case 'DANMU_MSG':
            const info = message["info"];
            return new DanmaMessage({
                cmd: message["cmd"],
                uid: info[2][0],
                username: info[2][1],
                message: info[1],
                guard: info[7],
                is_admin: info[2][2] === 1,
                type: info[0][1],
                fontSize: info[0][2],
                color: info[0][3],
                timestamp: info[0][4],
            })
        case 'SEND_GIFT':
        case 'GUARD_BUY':
        case 'USER_TOAST_MSG':
        case 'SUPER_CHAT_MESSAGE':
        case 'SUPER_CHAT_MESSAGE_JPN':
        case 'WELCOME':
        case 'WELCOME_GUARD':
            return { cmd: message["cmd"], ...message["data"] };
        default:
            return { cmd: message["cmd"] };
    }
}

class LiveEvent {
    constructor(roomId, path) {
        this.roomId = roomId;
        this.path = path;
        this.txtFile = fs.openSync(path + ".txt", 'a+');
        this.xmlFile = fs.openSync(path + ".xml", 'a+');
        this.jsonFile = fs.openSync(path + ".json", 'a+');
        this.afterFirst = false;
        this.startTime = Date.now();

        const live = new KeepLiveTCP(roomId);
        this.live = live;
        live.on('open', () => {
            fs.writeSync(this.xmlFile, `<?xml version="1.0" encoding="UTF-8"?>
<i>
<chatserver>chat.bilibili.com</chatserver>
<chatid>0</chatid>
<mission>0</mission>
<maxlimit>2147483647</maxlimit>
<state>0</state>
<app>vtb_record</app>
<roomid>${roomId}</roomid>
<source>n-a</source>
`);
            fs.writeSync(this.jsonFile, '[\n');
            console.log(`${roomId} Connection is established`);
        });
        live.on('live', () => {
            live.on('msg', (data) => {
                let message = parseMessage(data);
                this.writeRaw(data);
                this.writePlainText(message);
                this.writeDanmu(message);
            })
        })
        live.on('close', () => {
            fs.writeSync(this.xmlFile, '</i>');
            fs.writeSync(this.jsonFile, '\n]');
            fs.closeSync(this.txtFile);
            fs.closeSync(this.xmlFile);
            fs.closeSync(this.jsonFile);
            let newPath = this.newPath;
            fs.renameSync(path + ".txt", newPath + ".txt");
            fs.renameSync(path + ".xml", newPath + ".xml");
            fs.renameSync(path + ".json", newPath + ".json");
            console.log(`${roomId} Connection is closed`);
        })
    }

    writeDanmu(message) {
        if (message.cmd != 'DANMU_MSG') {
            return;
        }
        const lastTime = Date.now() - this.startTime;
        const second = Math.floor(lastTime / 1000);
        const damnu = message.message.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
        fs.writeSync(this.xmlFile, `<d p="${second},${message.type},${message.fontSize},${message.color},${message.timestamp},0,${message.uid},0">${damnu}</d>\n`)
    }

    writePlainText(message) {
        switch (message.cmd) {
            case 'DANMU_MSG':
                fs.writeSync(this.txtFile, `${message.username}: ${message.message}\n`);
                return;
            case 'SEND_GIFT':
                fs.writeSync(this.txtFile, `${message.uname} ${message.action} ${message.num} 个 ${message.giftName}\n`);
                return;
            case 'GUARD_BUY':
            case 'USER_TOAST_MSG':
                fs.writeSync(this.txtFile, `欢迎 ${message.uname} 上舰：${message.num} 个 ${message.gift_name}\n`);
                return;
            case 'SUPER_CHAT_MESSAGE':
                fs.writeSync(this.txtFile, `${message.user_info.uname} 的 ${message.price} 元SC：${message.message}\n`);
                return;
            case 'SUPER_CHAT_MESSAGE_JPN':
                fs.writeSync(this.txtFile, `${message.user_info.uname} 的 ${message.price} 元SC：${message.message_jpn}\n`);
                return;
            case 'WELCOME':
                fs.writeSync(this.txtFile, `欢迎 ${message.uname} 进入直播间\n`);
                return;
            case 'WELCOME_GUARD':
                fs.writeSync(this.txtFile, `欢迎 ${message.uname} 老爷进入直播间\n`);
                return;
            default:
                return;
        }
    }

    writeRaw(data) {
        if (this.afterFirst) {
            fs.writeSync(this.jsonFile, ',\n');
        } else {
            this.afterFirst = true;
        }
        fs.writeSync(this.jsonFile, JSON.stringify(data, null, 2));
    }
}