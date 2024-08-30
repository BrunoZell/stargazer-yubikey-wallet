# OpenSSL Windows Commands

```cmd
> opensc-tool -l
# Detected readers (pcsc)
Nr.  Card  Features  Name
0    Yes             Yubico YubiKey OTP+FIDO+CCID 1
```

```cmd
> pkcs11-tool --module "C:\Program Files\OpenSC Project\OpenSC\pkcs11\opensc-pkcs11.dll" -L
Available slots:
Slot 0 (0x0): Yubico YubiKey OTP+FIDO+CCID 1
  token label        : PIV_II
  token manufacturer : piv_II
  token model        : PKCS#15 emulated
  token flags        : login required, rng, token initialized, PIN initialized
  hardware version   : 0.0
  firmware version   : 0.0
  serial num         : 1ff0724eb840cfec
  pin min/max        : 4/8
```

```cmd
> pkcs11-tool --module "C:\Program Files\OpenSC Project\OpenSC\pkcs11\opensc-pkcs11.dll" -O
Using slot 0 with a present token (0x0)
Profile object 4292604928
  profile_id:          CKP_PUBLIC_CERTIFICATES_TOKEN (4)
Data object 4292730080
  label:          'Card Capability Container'
  application:    'Card Capability Container'
  app_id:         2.16.840.1.101.3.7.1.219.0
  flags:          <empty>
Data object 4292732000
  label:          'Card Holder Unique Identifier'
  application:    'Card Holder Unique Identifier'
  app_id:         2.16.840.1.101.3.7.2.48.0
  flags:          <empty>
Data object 4292731520
  label:          'Unsigned Card Holder Unique Identifier'
  application:    'Unsigned Card Holder Unique Identifier'
  app_id:         2.16.840.1.101.3.7.2.48.2
  flags:          <empty>
Data object 4292728928
  label:          'X.509 Certificate for PIV Authentication'
  application:    'X.509 Certificate for PIV Authentication'
  app_id:         2.16.840.1.101.3.7.2.1.1
  flags:          <empty>
Data object 4292730272
  label:          'X.509 Certificate for Digital Signature'
  application:    'X.509 Certificate for Digital Signature'
  app_id:         2.16.840.1.101.3.7.2.1.0
  flags:          <empty>
Data object 4292731904
  label:          'X.509 Certificate for Key Management'
  application:    'X.509 Certificate for Key Management'
  app_id:         2.16.840.1.101.3.7.2.1.2
  flags:          <empty>
Data object 4292730560
  label:          'X.509 Certificate for Card Authentication'
  application:    'X.509 Certificate for Card Authentication'
  app_id:         2.16.840.1.101.3.7.2.5.0
  flags:          <empty>
Data object 4292729024
  label:          'Security Object'
  application:    'Security Object'
  app_id:         2.16.840.1.101.3.7.2.144.0
  flags:          <empty>
Data object 4292730368
  label:          'Discovery Object'
  application:    'Discovery Object'
  app_id:         2.16.840.1.101.3.7.2.96.80
  flags:          <empty>
Data object 4292732288
  label:          'Biometric Information Templates Group Template'
  application:    'Biometric Information Templates Group Template'
  app_id:         2.16.840.1.101.3.7.2.16.22
  flags:          <empty>
Data object 4292730656
  label:          'Secure Messaging Certificate Signer'
  application:    'Secure Messaging Certificate Signer'
  app_id:         2.16.840.1.101.3.7.2.16.23
  flags:          <empty>
```
