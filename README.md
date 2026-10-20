# serialport-napi-rs

NAPI-RS addon for [`serialport`](https://docs.rs/serialport/latest/serialport/) (using [`tokio-serial`](https://docs.rs/tokio-serial/latest/tokio_serial/)), with a simple, modern, async API for Node.js v24 or later.

See [package.json](package.json) `napi.targets` for currently supported targets.
Per NAPI-RS release design, a root package is published with per-target optional dependencies (in separate packages); the appropriate optional dependency is chosen automatically on installation.

> [!IMPORTANT]
> Work in progress.

## Usage

See [index.d.ts](index.d.ts) for the package's full types.

```ts
import { NativeSerialPort, type SerialPortOptions } from "@koenkk/serialport-napi-rs";

const port = await NativeSerialPort.open(
    "/dev/ttyUSB0",
    {
        baudRate: 115200,
        dataBits: 8,
        parity: "none",
        stopBits: 1,
        flowControl: "none",
        dtrOnOpen: undefined,
        commandChannelCapacity: 16,
    },
    (error, data) => {
        if (error) {
            console.log(error);
        } else {
            console.log(data.toString("hex"));
        }
    },
);

await port.write(Buffer.from([0x01]));

await port.close();
```
