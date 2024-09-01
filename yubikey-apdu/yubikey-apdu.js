const pcsclite = require('pcsclite');
const fs = require('fs');
const http = require('http');

const logFile = fs.createWriteStream('./yubikey-apdu-logfile.txt', { flags: 'a' });

function log(message) {
    console.log(message);
    logFile.write(`${new Date().toISOString()} - ${message}\n`, () => {
        logFile.end();
    });
}

async function signDataWithYubikey(rawSha512Buffer, pin) {
    const pcsc = pcsclite();

    return new Promise((resolve, reject) => {
        pcsc.on('reader', function(reader) {
            log(`Reader detected: ${reader.name}`);

            reader.on('error', function(err) {
                log(`Error: ${err.message}`);
                reject(err);
            });

            reader.on('status', function(status) {
                log(`Status: ${JSON.stringify(status)}`);

                // Check if a card is present
                const changes = reader.state ^ status.state;
                if (changes & reader.SCARD_STATE_PRESENT && status.state & reader.SCARD_STATE_PRESENT) {
                    log('Card inserted');

                    reader.connect({ share_mode: reader.SCARD_SHARE_SHARED }, async function(err, protocol) {
                        if (err) {
                            log(`Error connecting to card: ${err.message}`);
                            reject(err);
                            return;
                        }

                        log(`Protocol: ${protocol}`);
                        const pgpApduCommand = '00A4040006D27600012401';
                        log(`PGP APDU Command: ${pgpApduCommand}`);

                        // Parameterize the PIN
                        const pinHex = Buffer.from(pin, 'utf8').toString('hex');
                        const pinLengthHex = (pin.length).toString(16).padStart(2, '0');

                        // Construct the PIN APDU command
                        const pinCLA = '00';
                        const pinINS = '20'; // (Instruction byte for VERIFY)
                        const pinP1 = '00'; // Parameter 1, usually 00 for VERIFY
                        const pinP2 = '81'; // reference control parameter: Must be 81 for SIGN as specified in 7.2.10
                        const pinLc = pinLengthHex;
                        const pinData = pinHex;

                        const pinApduCommand = pinCLA + pinINS + pinP1 + pinP2 + pinLc + pinData;
                        log(`PIN APDU Command: ${pinApduCommand}`);

                        // Construct the signing APDU command
                        const CLA = '00';
                        const INS = '2A'; // PERFORM SECURITY OPERATION
                        const P1 = '9E'; // 9E specifies that the operation is to compute a digital signature
                        const P2 = '9A'; // 9A specifies that the data is a hash that needs to be signed
                        const Lc = '40'; // hex for 64, so 512 bits for a SHA512
                        const Data = rawSha512Buffer.toString('hex');
                        const Le = '00';

                        const apduCommand = CLA + INS + P1 + P2 + Lc + Data + Le;
                        log(`SIGN APDU Command: ${apduCommand}`);

                        const successStatusResponse = '9000';

                        try {
                            // Send the PGP APDU command
                            let response = await new Promise((resolve, reject) => {
                                reader.transmit(Buffer.from(pgpApduCommand, 'hex'), 256, protocol, function(err, data) {
                                    if (err) {
                                        log(`Error transmitting PGP APDU: ${err.message}`);
                                        reject(err);
                                    } else {
                                        log(`PGP APDU Executed: ${pgpApduCommand} -> Response: ${data.toString('hex')}`);
                                        resolve(data);
                                    }
                                });
                            });

                            // Check the status word of the response
                            let statusWord = response.slice(-2).toString('hex');
                            if (statusWord !== successStatusResponse) {
                                reject(new Error(`Unexpected status word: ${statusWord}`));
                                return;
                            }

                            // Send the PIN APDU command
                            response = await new Promise((resolve, reject) => {
                                reader.transmit(Buffer.from(pinApduCommand, 'hex'), 256, protocol, function(err, data) {
                                    if (err) {
                                        log(`Error transmitting PIN APDU: ${err.message}`);
                                        reject(err);
                                    } else {
                                        log(`PIN APDU Executed: ${pinApduCommand} -> Response: ${data.toString('hex')}`);
                                        resolve(data);
                                    }
                                });
                            });

                            // Check the status word of the response
                            statusWord = response.slice(-2).toString('hex');
                            if (statusWord !== successStatusResponse) {
                                reject(new Error(`Unexpected status word: ${statusWord}`));
                                return;
                            }

                            // Send the signing APDU command
                            response = await new Promise((resolve, reject) => {
                                reader.transmit(Buffer.from(apduCommand, 'hex'), 256, protocol, function(err, data) {
                                    if (err) {
                                        log(`Error transmitting SIGN APDU: ${err.message}`);
                                        reject(err);
                                    } else {
                                        log(`SIGN APDU Executed: ${apduCommand} -> Response: ${data.toString('hex')}`);
                                        resolve(data);
                                    }
                                });
                            });

                            // Check the status word of the response
                            statusWord = response.slice(-2).toString('hex');
                            if (statusWord !== successStatusResponse) {
                                reject(new Error(`Unexpected status word: ${statusWord}`));
                                return;
                            }

                            reader.disconnect(reader.SCARD_LEAVE_CARD, function(err) {
                                if (err) {
                                    log(`Error disconnecting from card: ${err.message}`);
                                    reject(err);
                                } else {
                                    log('Disconnected from card with final signature response: ' + response.toString('hex'));

                                    // Extract the signature
                                    const signature = response.slice(0, 64).toString('hex');
                                    resolve(signature);
                                }
                            });
                        } catch (err) {
                            reject(err);
                        }
                    });
                }
            });

            reader.on('end', function() {
                log('Reader removed');
            });
        });

        pcsc.on('error', function(err) {
            log(`PCSC error: ${err.message}`);
            reject(err);
        });
    });
}

///// As command line tool:

// async function main() {
//     const [,, hash, pin] = process.argv;
//     if (!hash || !pin) {
//         console.error('Usage: node yubikey-apdu.js <sha512-hash> <pin>');
//         process.exit(1);
//     }

//     const rawSha512Buffer = Buffer.from(hash, 'hex');

//     try {
//         const signature = await signDataWithYubikey(rawSha512Buffer, pin);
//         console.log(JSON.stringify({ signature }));
//     } catch (error) {
//         console.error(JSON.stringify({ error: error.message }));
//     }
//     process.exit(0); // Terminate the process after successful response
// }

// main().catch(error => {
//     log(`Unhandled error: ${error.message}`);
//     process.exit(1);
// });


///// As http server:


const server = http.createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/sign') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            console.log(`Request received: ${body}`); // Log the request body
            try {
                const { hash, pin } = JSON.parse(body);
                const rawSha512Buffer = Buffer.from(hash, 'hex');
                const signature = await signDataWithYubikey(rawSha512Buffer, pin);
                const response = JSON.stringify({ signature });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(response);
                console.log(`Response sent: ${response}`); // Log the response
            } catch (error) {
                const errorResponse = JSON.stringify({ error: error.message });
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(errorResponse);
                console.log(`Error response sent: ${errorResponse}`); // Log the error response
            }
        });
    } else {
        const notFoundResponse = JSON.stringify({ error: 'Not Found' });
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(notFoundResponse);
        console.log(`Not Found response sent: ${notFoundResponse}`); // Log the 404 response
    }
});

server.listen(3333, () => {
    log('Server is listening on port 3333');
});