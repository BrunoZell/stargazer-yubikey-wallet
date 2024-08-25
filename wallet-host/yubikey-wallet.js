const { exec } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

function readMessage() {
    return new Promise((resolve, reject) => {
        let rawLength = '';
        process.stdin.once('data', (chunk) => {
            rawLength += chunk;
            const messageLength = rawLength.readUInt32LE(0);
            const message = rawLength.slice(4, 4 + messageLength).toString();
            resolve(JSON.parse(message));
        });
    });
}

function sendMessage(message) {
    const jsonMessage = JSON.stringify(message);
    const messageLength = Buffer.byteLength(jsonMessage);
    const buffer = Buffer.alloc(4 + messageLength);
    buffer.writeUInt32LE(messageLength, 0);
    buffer.write(jsonMessage, 4);
    process.stdout.write(buffer);
}

async function handleMessages() {
    while (true) {
        const message = await readMessage();
        if (message.command === 'getPublicKey') {
            exec('gpg --card-status', (error, stdout, stderr) => {
                if (error) {
                    sendMessage({ error: error.message });
                } else {
                    const publicKey = parsePublicKey(stdout);
                    sendMessage({ publicKey });
                }
            });
        } else if (message.command === 'signMessage') {
            const { hexString } = message;
            exec(`echo ${hexString} | gpg --sign --armor`, (error, stdout, stderr) => {
                if (error) {
                    sendMessage({ error: error.message });
                } else {
                    sendMessage({ signature: stdout });
                }
            });
        } else {
            sendMessage({ error: 'Unknown command' });
        }
    }
}

function parsePublicKey(gpgOutput) {
    const publicKeyRegex = /key\s+([0-9A-F]+)\s+ED25519/;
    const match = gpgOutput.match(publicKeyRegex);
    return match ? match[1] : null;
}

handleMessages();