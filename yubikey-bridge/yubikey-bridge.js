const { execSync } = require('child_process');
const fs = require('fs');
const pcsclite = require('pcsclite');

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
                // This calculates how many more bytes are needed to complete the message.
                // Math.min ensures that we only copy the smaller of the two values, either the remaining bytes needed to complete the message or the length of the current chunk.
                const bytesToCopy = Math.min(messageLength - receivedLength, chunk.length);
                chunk.copy(messageBuffer, receivedLength, 0, bytesToCopy);
                receivedLength += bytesToCopy;
                // The remaining bytes are the bytes that were not needed to complete the message and are
                // just discarded as this implementation expects only one request message per execution.
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

async function signDataWithYubikey(rawSha512Buffer, pin) {
    const pcsc = pcsclite();

    return new Promise((resolve, reject) => {
        pcsc.on('reader', function(reader) {
            log('Reader detected:', reader.name);

            reader.on('error', function(err) {
                log('Error:', err.message);
                reject(err);
            });

            reader.on('status', function(status) {
                log('Status:', status);

                // Check if a card is present
                const changes = reader.state ^ status.state;
                if (changes & reader.SCARD_STATE_PRESENT && status.state & reader.SCARD_STATE_PRESENT) {
                    log('Card inserted');

                    reader.connect({ share_mode: reader.SCARD_SHARE_SHARED }, function(err, protocol) {
                        if (err) {
                            log('Error connecting to card:', err.message);
                            reject(err);
                            return;
                        }

                        log('Protocol:', protocol);

                        // Parameterize the PIN
                        const pinHex = Buffer.from(pin, 'utf8').toString('hex');
                        const pinLengthHex = (pin.length).toString(16).padStart(2, '0');

                        // Construct the PIN APDU command
                        const pinCLA = '00';
                        const pinINS = '20'; // (Instruction byte for VERIFY
                        const pinP1 = '00'; // Parameter 1, usually 00 for VERIFY
                        const pinP2 = '81'; // reference control parameter: Must be 81 for SIGN as specified in 7.2.10
                        const pinLc = pinLengthHex;
                        const pinData = pinHex;

                        const pinApduCommand = pinCLA + pinINS + pinP1 + pinP2 + pinLc + pinData;
                        log('PIN APDU Command:', pinApduCommand);

                        // Construct the signing APDU command
                        const CLA = '00';
                        const INS = '2A'; // PERFORM SECURITY OPERATION
                        const P1 = '9E'; // 9E specifies that the operation is to compute a digital signature
                        const P2 = '9A'; // 9A specifies that the data is a hash that needs to be signed
                        const Lc = '40'; // hex for 64, so 512 bits for a SHA512
                        const Data = rawSha512Buffer.toString('hex');
                        const Le = '00';

                        const apduCommand = CLA + INS + P1 + P2 + Lc + Data + Le;
                        log('APDU Command:', apduCommand);

                        const apduCommands = [
                            Buffer.from('00A4040006D27600012401', 'hex'),  // Select the OpenPGP application
                            Buffer.from(pinApduCommand, 'hex'),  // Verify the PIN
                            Buffer.from(apduCommand, 'hex'),  // Perform signing
                        ];

                        // Send APDU commands sequentially
                        (async function sendCommands() {
                            try {
                                let signatureResponse;
                                for (const apdu of apduCommands) {
                                    signatureResponse = await new Promise((resolve, reject) => {
                                        reader.transmit(apdu, 256, protocol, function(err, data) {
                                            if (err) {
                                                log('Error transmitting APDU:', err.message);
                                                reject(err);
                                            } else {
                                                log('APDU:', apdu.toString('hex'), '-> Response:', data.toString('hex'));
                                                resolve(data);
                                            }
                                        });
                                    });
                                }

                                reader.disconnect(reader.SCARD_LEAVE_CARD, function(err) {
                                    if (err) {
                                        log('Error disconnecting from card:', err.message);
                                        reject(err);
                                    } else {
                                        log('Disconnected from card');

                                        // Extract the signature and status word
                                        const signature = signatureResponse.slice(0, 64).toString('hex');
                                        const statusWord = signatureResponse.slice(64).toString('hex');

                                        if (statusWord === '9000') {
                                            resolve(signature);
                                        } else {
                                            reject(new Error(`Unexpected status word: ${statusWord}`));
                                        }
                                    }
                                });
                            } catch (err) {
                                reject(err);
                            }
                        })();
                    });
                }
            });

            reader.on('end', function() {
                log('Reader removed');
            });
        });

        pcsc.on('error', function(err) {
            log('PCSC error:', err.message);
            reject(err);
        });
    });
}

async function handleMessage() {
    try {
        const message = await readMessage();
        if (message.command === 'getPublicKey') {
            log(`Processing getPublicKey message`);
            try {
                const statusStdout = execSync('gpg --card-status', { encoding: 'utf8' });
                log(`gpg output received:\n${statusStdout}`);

                const { fingerprint, serialNumber, hasNoSignatureKey, keyAttributes } = parseFingerprint_fromGpgCardStatusOutput(statusStdout);

                if (hasNoSignatureKey || !fingerprint) {
                    sendMessage({
                        error: `No signature key on Yubikey with serial number ${serialNumber}.`,
                        serial: serialNumber
                    });
                    return;
                }

                if (keyAttributes.sign.toLowerCase() !== "secp256k1") {
                    sendMessage({
                        error: `Signature key is not of type secp256k1 on Yubikey with serial number ${serialNumber}.`,
                        serial: serialNumber,
                        type: keyAttributes.sign
                    });
                    return;
                }

                // Run the gpg --export --armor command to get the public key in ASCII-armored format
                const publicKeyArmor = execSync('gpg --export --armor ' + fingerprint, { encoding: 'utf8' });

                log(`gpg key export:\n${publicKeyArmor}`);

                const publicKeyPackets = execSync('gpg --list-packets --verbose', {
                    input: publicKeyArmor,
                    encoding: 'utf8'
                });

                log(`gpg key packets:\n${publicKeyPackets}`);

                const publicKeyHex = parsePublicKey_fromGpgListPublicKetPacketsVerboseOutput(publicKeyPackets);

                sendMessage({
                    fingerprint: fingerprint,
                    publicKey: publicKeyHex,
                    serial: serialNumber,
                    type: keyAttributes.sign
                });
            } catch (error) {
                log(`gpg error: ${error.message}`);
                sendMessage({ error: error.message });
            }
        } else if (message.command === 'signHash') {
            log(`Processing signHash message`);
            const { publicKey, fingerprint, hash /*, pin*/ } = message;
            try {
                log(`Signing hash ${hash} with fingerprint ${fingerprint} and public key ${publicKey}`);

                // Interpret hex string as buffer
                const hashBuffer = Buffer.from(hash, 'hex');

                // Sign the binary data using Yubikey
                const pin = "123456";
                const signature = await signDataWithYubikey(hashBuffer, pin);
                log(`Signature extracted from APDU: ${signature}`);

                sendMessage({ signature });
            } catch (error) {
                log(`Yubikey APDU error: ${error.message}`);
                sendMessage({ error: error.message });
            }
        } else {
            sendMessage({ error: 'Unknown command' });
        }
    } catch (error) {
        sendMessage({ error: error.message });
        log(`Error handling message: ${error.message}`);
    }
}

function parseFingerprint_fromGpgCardStatusOutput(gpgOutput) {
    const signatureKeyFingerprintRegex = /Signature key\s*\.*:\s+([0-9A-F\s]+)(?=\r?\n)/;
    const signatureKeyNoneRegex = /Signature key\s*\.*:\s+\[none\]/;
    const serialNumberRegex = /Serial number\s*\.*:\s+(\d+)/;
    const keyAttributesRegex = /Key attributes\s*\.*:\s+([a-z0-9\s]+)(?=\r?\n)/i;

    const signatureKeyFingerprintMatch = gpgOutput.match(signatureKeyFingerprintRegex);
    const serialNumberMatch = gpgOutput.match(serialNumberRegex);
    const keyAttributesMatch = gpgOutput.match(keyAttributesRegex);

    const signatureKeyFingerprint = signatureKeyFingerprintMatch ? signatureKeyFingerprintMatch[1].replace(/\s+/g, '') : null;
    const serialNumber = serialNumberMatch ? serialNumberMatch[1] : null;
    const hasNoSignatureKey = signatureKeyNoneRegex.test(gpgOutput);

    if (serialNumber) {
        log(`Serial number ${serialNumber} extracted from: "${serialNumberMatch[0]}"`);
    } else {
        log(`No serial number found`);
    }

    if (signatureKeyFingerprint) {
        log(`Key fingerprint ${signatureKeyFingerprint} extracted from: "${signatureKeyFingerprintMatch[0]}"`);
    } else {
        log(`No signature key fingerprint found`);
    }

    log(`Has [none] signature key: ${hasNoSignatureKey}`);

    let keyAttributes = { sign: null, encrypt: null, authenticate: null };
    if (keyAttributesMatch) {
        const attributes = keyAttributesMatch[1].trim().split(/\s+/);
        if (attributes.length === 3) {
            keyAttributes = {
                sign: attributes[0],
                encrypt: attributes[1],
                authenticate: attributes[2]
            };
            log(`Key attributes extracted: sign=${keyAttributes.sign}, encrypt=${keyAttributes.encrypt}, authenticate=${keyAttributes.authenticate}`);
        } else {
            log(`Could not extract key attributes from: ${keyAttributesMatch[0]}`);
        }
    } else {
        log(`No key attributes found`);
    }

    return { fingerprint: signatureKeyFingerprint, serialNumber, hasNoSignatureKey, keyAttributes };
}

function parsePublicKey_fromGpgListPublicKetPacketsVerboseOutput(gpgOutput) {
    // Regular expression to match the public key packet and extract pkey[1]
    const publicKeyPacketRegex = /:public key packet:\r?\n\s+version \d+, algo \d+, created \d+, expires \d+\r?\n\s+pkey\[0\]: [0-9A-F]+ .+\r?\n\s+pkey\[1\]: ([0-9A-F]+)\r?\n\s+keyid: [0-9A-F]+/;
    const match = gpgOutput.match(publicKeyPacketRegex);

    if (match) {
        const publicKeyHex = match[1];
        log(`Public key ${publicKeyHex} extrated from packet match:\n${match[0]}`);
        return publicKeyHex;
    } else {
        throw new Error("Public key packet not found.");
    }
}

function parseSignature_fromGpgListSignaturePacketsVerboseOutput(gpgOutput) {
    const signaturePacketRegex = /:signature packet:.*?data: ([0-9A-F]+).*?data: ([0-9A-F]+)/s;
    const match = gpgOutput.match(signaturePacketRegex);

    if (match) {
        const rawSignature = match[1] + match[2];
        log(`Raw signature extracted: ${rawSignature} from packet match:\n${match[0]}`);
        return rawSignature;
    } else {
        throw new Error("Signature packet not found.");
    }
}

async function main() {
    await handleMessage();
}

main().catch(error => {
    log(`Unhandled error: ${error.message}`);
    process.exit(1);
});