const { exec } = require('child_process');
const fs = require('fs');

const logFile = fs.createWriteStream('./yubikey-bridge-logfile.txt', { flags: 'a' });

function log(message) {
    logFile.write(`${new Date().toISOString()} - ${message}\n`, () => {
        logFile.end();
    });
}

function readMessage() {
    return new Promise((resolve, reject) => {
        let rawLength = Buffer.alloc(4); // Buffer to store the length of the message
        let messageBuffer = null;
        let messageLength = 0;
        let receivedLength = 0;

        function onData(chunk) {
            if (messageBuffer === null) {
                // Case: Message length is not yet known
                // Accumulate the first 4 bytes to determine message length
                log(`Received raw length chunk: ${chunk.toString('hex')}`);
                chunk.copy(rawLength, receivedLength); // Copy chunk into rawLength starting at receivedLength
                receivedLength += chunk.length;

                if (receivedLength >= 4) {
                    // Once 4 bytes are received, read the message length
                    messageLength = rawLength.readUInt32LE(0);
                    log(`Parsed message length: ${messageLength}`);
                    messageBuffer = Buffer.alloc(messageLength);
                    
                    // Handle remaining data in the chunk
                    const remainingChunk = chunk.slice(4);
                    remainingChunk.copy(messageBuffer, 0); // Copy remaining chunk into messageBuffer
                    receivedLength = remainingChunk.length;
                }
            } else {
                // Case: Message length is known but not all data has been received yet
                // Accumulate chunks into messageBuffer
                log(`Received message chunk: ${chunk.toString('hex')}`);
                chunk.copy(messageBuffer, receivedLength); // Copy chunk into messageBuffer starting at receivedLength
                receivedLength += chunk.length;
            }

            // Check if the entire message has been received
            if (receivedLength >= messageLength) {
                // Case: Message length is known and all data has been received
                const message = messageBuffer.toString();
                log(`Parsed message: ${message}`);
                process.stdin.removeListener('data', onData);
                resolve(JSON.parse(message));
            }
        }

        process.stdin.on('data', onData);

        // Add a timeout to detect if the process is hanging
        setTimeout(() => {
            process.stdin.removeListener('data', onData);
            reject(new Error('Timeout waiting for message'));
        }, 5000); // 5 seconds timeout
    });
}

function sendMessage(message) {
    const jsonMessage = JSON.stringify(message);
    const messageLength = Buffer.byteLength(jsonMessage);
    const buffer = Buffer.alloc(4 + messageLength);
    buffer.writeUInt32LE(messageLength, 0);
    buffer.write(jsonMessage, 4);
    
    log(`Sending message: ${jsonMessage}`);
    try {
        process.stdout.write(buffer);
        log(`Successfully sent message: ${jsonMessage}`);
    } catch (error) {
        log(`Failed to send message: ${error.message}`);
    }
}

async function handleMessage() {
    try {
        const message = await readMessage();
        log(`Received message: ${JSON.stringify(message)}`);
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
        log(`Error handling message: ${error.message}`);
    }
}

function parsePublicKey(gpgOutput) {
    const publicKeyRegex = /key\s+([0-9A-F]+)\s+ED25519/;
    const match = gpgOutput.match(publicKeyRegex);
    return match ? match[1] : null;
}

handleMessage();