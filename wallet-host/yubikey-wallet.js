const { exec } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

function readMessage() {
    return new Promise((resolve, reject) => {
        let rawLength = Buffer.alloc(4);
        process.stdin.once('data', (chunk) => {
            chunk.copy(rawLength);
            const messageLength = rawLength.readUInt32LE(0);
            const messageBuffer = Buffer.alloc(messageLength);
            process.stdin.once('data', (chunk) => {
                chunk.copy(messageBuffer);
                const message = messageBuffer.toString();
                resolve(JSON.parse(message));
            });
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
        try {
            const message = await readMessage();
            if (message.command === 'getPublicKey') {
                sendMessage({ error: 'Not implemented' });
                // exec('gpg --card-status', (error, stdout, stderr) => {
                //     if (error) {
                //         sendMessage({ error: error.message });
                //     } else {
                //         const publicKey = parsePublicKey(stdout);
                //         sendMessage({ publicKey });
                //     }
                // });
            } else if (message.command === 'signMessage') {
                sendMessage({ error: 'Not implemented' });
                // const { hexString } = message;
                // exec(`echo ${hexString} | gpg --sign --armor`, (error, stdout, stderr) => {
                //     if (error) {
                //         sendMessage({ error: error.message });
                //     } else {
                //         sendMessage({ signature: stdout });
                //     }
                // });
            } else {
                sendMessage({ error: 'Unknown command' });
            }
        } catch (error) {
            sendMessage({ error: error.message });
        }
    }
}

function parsePublicKey(gpgOutput) {
    const publicKeyRegex = /key\s+([0-9A-F]+)\s+ED25519/;
    const match = gpgOutput.match(publicKeyRegex);
    return match ? match[1] : null;
}

handleMessages();