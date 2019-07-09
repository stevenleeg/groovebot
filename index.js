require('dotenv').config();

const io = require('socket.io-client');
const uuid = require('uuid/v1');
const readline = require('readline');
const emojis = require('emojis-list');

class Actor {
  constructor(index) {
    this.id = index;
    this.peerId = null;
    this._chatInterval = null;

    this.connect();
  }

  connect = () => {
    this._log('connecting to', process.env.BUOY_URL);
    this.socket = io(process.env.BUOY_URL);

    this.socket.on('connect', () => {
      this._log('connected to buoy');
      this.authenticate();
    });

    this.socket.on('disconnect', () => {
      this._log('disconnected');
    });
  }

  authenticate = async () => {
    const resp = await this._call({
      name: 'join',
      params: {jwt: process.env.INVITE_CODE},
    });

    if (resp.error) {
      this._log('could not authenticate');
      this.disconnect();
    }

    this.peerId = resp.peerId;
    this._log(`authenticated with peerId ${this.peerId}`);
  }

  joinRoom = async () => {
    // Join the first room we see
    const rooms = await this._call({name: 'fetchRooms'});

    if (rooms.length === 0) {
      this._log('could not find room to join');
      return false;
    }

    this._log(`found ${rooms.length} rooms. joining first...`);
    const joinResp = await this._call({
      name: 'joinRoom',
      params: {id: rooms[0].id},
    });

    if (joinResp.error) {
      this._log('could not join room: ', joinResp.message);
      return false;
    }

    this._log(`joined room ${rooms[0].id}`);
    return true;
  }

  setProfile = async () => {
    const randomEmoji = emojis[Math.floor(Math.random() * 20)];
    const resp = await this._call({
      name: 'setProfile',
      params: {
        profile: {
          emoji: randomEmoji,
          handle: `Actor ${this.id}`,
        },
      },
    });
  }

  beginChat = () => {
    if (this._chatInterval) {
      return;
    }

    this._chatInterval = setInterval(() => {
      const randomNumber = Math.random();
      const randomEmoji = emojis[Math.floor(Math.random() * 20)];

      this._call({
        name: 'sendChat',
        params: {message: `${randomEmoji} ${randomNumber}`},
      });
    }, 1500);
  }

  endChat = () => {
    clearInterval(this._chatInterval);
    this._chatInterval = null;
  }

  disconnect = () => {
    this.socket.close();
  }

  ////
  // Helpers
  //
  _log = (...args) => {
    console.log(`[${this.id}]`, ...args);
  }

  _call = ({name, params}) => {
    return new Promise((resolve, reject) => {
      this.socket.emit('call', {name, params}, (resp) => {
        resolve(resp);
      });
    });
  }
}

(async () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  // Spin up actors
  if (process.argv.length !== 5) {
    console.log('Please provide a number of actors to spin up');
    process.exit(1);
  }

  const actorCount = parseInt(process.argv[4]);
  const actors = [];
  for (let i = 0; i < actorCount; i += 1) {
    actors.push(new Actor(i));
  }

  // Start accepting commands
  for await (const text of rl) {
    const cmd = text.split(' ');

    // We're commanding an individual actor
    if (!isNaN(cmd[0])) {
      const actor = actors[parseInt(cmd[0])];
      if (!actor) {
        console.log('could not find actor with id', cmd[0]);
        continue;
      }

      switch (cmd[1]) {
        case 'joinRoom':
          const joinResp = await actor.joinRoom();
          if (!joinResp) return;
          await actor.setProfile();
          break;
        case 'beginChat':
          actor.beginChat();
          break;
        case 'endChat':
          actor.endChat();
          break;
        default:
          console.log('invalid actor specific command', cmd[1]);
      }
    } else {
      switch (cmd[0]) {
        case 'joinRoom':
          for (const actor of actors) {
            const joinResp = await actor.joinRoom();
            if (!joinResp) return;
            await actor.setProfile();
          }
          break;
        default:
          console.log('invalid command', cmd[0]);
          break;
      }
    }
  }
})();
