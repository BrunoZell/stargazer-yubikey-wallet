# Example Requests

## `yubikey-apdu` as command line

(this is commented out in `yubikey-apdu.js`):

```cmd
node yubikey-apdu.js 9b7927c62c590215359990c883bb32519618690531bb666e74d4dcd600d1fdb2433d047eecd0abbf7fd39b1fd67177c0a0a840ad891e5fec307ccaeed90315d2 123456
```

## `yubikey-apdu` as API server

The default mode of `yubikey-apdu` is to run as an API server. Thats what the `yubikey-bridge` expects.

### Start the server

```cmd
node yubikey-apdu.js
```

### Send signing request

Just as the `yubikey-bridge` would do:

```cmd
curl -X POST http://localhost:3333/sign -H "Content-Type: application/json" -d @apdu-payload.json
```
