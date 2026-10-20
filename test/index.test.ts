import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createReadStream, createWriteStream, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { availablePorts, NativeSerialPort } from "../index.js";

const noop = () => {};

test("rejects an invalid command_channel_capacity value", (t: TestContext) => {
    t.assert.rejects(async () => {
        await NativeSerialPort.open("/path/that/does/not/matter", { commandChannelCapacity: 0 }, noop);
    }, /command_channel_capacity/);
});

test("rejects an invalid data_bits value", (t: TestContext) => {
    t.assert.rejects(async () => {
        await NativeSerialPort.open(
            "/path/that/does/not/matter",
            {
                // @ts-expect-error bad on purpose
                dataBits: 9,
            },
            noop,
        );
    }, /data_bits/);
});

test("rejects an invalid parity value", (t: TestContext) => {
    t.assert.rejects(async () => {
        await NativeSerialPort.open(
            "/path/that/does/not/matter",
            {
                // @ts-expect-error bad on purpose
                parity: "mark",
            },
            noop,
        );
    }, /parity/);
});

test("rejects an invalid stop_bits value", (t: TestContext) => {
    t.assert.rejects(async () => {
        await NativeSerialPort.open(
            "/path/that/does/not/matter",
            {
                // @ts-expect-error bad on purpose
                stopBits: 3,
            },
            noop,
        );
    }, /stop_bits/);
});

test("rejects an invalid flow_control value", (t: TestContext) => {
    t.assert.rejects(async () => {
        await NativeSerialPort.open(
            "/path/that/does/not/matter",
            {
                // @ts-expect-error bad on purpose
                flowControl: "bad",
            },
            noop,
        );
    }, /flow_control/);
});

test("reports an unavailable device path", (t: TestContext) => {
    t.assert.rejects(async () => {
        await NativeSerialPort.open("/definitely/not/a/real/serial/device", {}, noop);
    });
});

test("availablePorts returns an array", (t: TestContext) => {
    const ports = availablePorts();

    t.assert.ok(Array.isArray(ports));

    for (const port of ports) {
        t.assert.strictEqual(typeof port.portName, "string");
        t.assert.strictEqual(typeof port.portType, "string");
    }
});

const hasSocat = process.platform !== "win32" && spawnSync("socat", ["-V"], { stdio: "ignore" }).status === 0;

test("exchanges data", { skip: !hasSocat }, async (t: TestContext) => {
    const dir = mkdtempSync(join(tmpdir(), "serial-"));
    const portA = join(dir, "a");
    const portB = join(dir, "b");
    const socat = spawn("socat", [`pty,link=${portA},raw,echo=0`, `pty,link=${portB},raw,echo=0`]);
    let serial: Awaited<ReturnType<typeof NativeSerialPort.open>> | undefined;
    let deviceRead: ReturnType<typeof createReadStream> | undefined;
    let deviceWrite: ReturnType<typeof createWriteStream> | undefined;
    let closing = false;
    let deviceReadError: Error | undefined;
    let resolveNext: ((data: Buffer) => void) | undefined;
    let rejectNext: ((error: Error) => void) | undefined;

    t.after(async (t: TestContext) => {
        closing = true;

        await serial?.close();
        deviceRead?.destroy();
        deviceWrite?.destroy();

        if (socat.exitCode === null && socat.signalCode === null) {
            socat.kill();
            await once(socat, "exit");
        }

        rmSync(dir, { recursive: true, force: true });
        t.assert.equal(deviceReadError, undefined);
        t.assert.equal(closing, true);
    });

    while (!existsSync(portA) || !existsSync(portB)) {
        await delay(20);
    }

    serial = await NativeSerialPort.open(portA, undefined, (err, data) => {
        if (err) {
            rejectNext?.(err);
        } else {
            resolveNext?.(data);
        }
    });

    const nextSerialData = () =>
        new Promise<Buffer>((resolve, reject) => {
            resolveNext = (data) => {
                resolveNext = undefined;
                rejectNext = undefined;
                resolve(data);
            };
            rejectNext = (error) => {
                resolveNext = undefined;
                rejectNext = undefined;
                reject(error);
            };
        });

    deviceRead = createReadStream(portB);

    deviceRead.on("error", (err) => {
        if (!closing) {
            deviceReadError = err;
        }
    });

    deviceWrite = createWriteStream(portB);

    await Promise.all([once(deviceRead, "open"), once(deviceWrite, "open")]);

    const fromSerial = once(deviceRead, "data");

    await serial.write(Buffer.from("hello device"));

    t.assert.equal((await fromSerial)[0].toString(), "hello device");

    const fromDevice = nextSerialData();

    deviceWrite.write("hello library");

    t.assert.equal((await fromDevice).toString(), "hello library");
    t.assert.equal(deviceReadError, undefined);
    t.assert.equal(closing, false);
});
