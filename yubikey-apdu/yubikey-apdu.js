const pcsclite = require('pcsclite');
const fs = require('fs');

const logFile = fs.createWriteStream('./yubikey-apdu-logfile.txt', { flags: 'a' });

function log(message) {
    logFile.write(`${new Date().toISOString()} - ${message}\n`);
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

async function main() {
    const [,, hash, pin] = process.argv;
    if (!hash || !pin) {
        console.error('Usage: node yubikey-apdu.js <sha512-hash> <pin>');
        process.exit(1);
    }

    const rawSha512Buffer = Buffer.from(hash, 'hex');

    try {
        const signature = await signDataWithYubikey(rawSha512Buffer, pin);
        console.log(JSON.stringify({ signature }));
    } catch (error) {
        console.error(JSON.stringify({ error: error.message }));
    }
}

main().catch(error => {
    log(`Unhandled error: ${error.message}`);
    process.exit(1);
});
