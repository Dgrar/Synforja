import { describe, expect, it } from "vitest";

import { SseDecoder, readSseEvents } from "@/lib/api/sse";

describe("SseDecoder", () => {
  it("parsea un frame completo en un solo chunk", () => {
    const decoder = new SseDecoder();
    const messages = decoder.decode(
      'event: start\ndata: {"epochs":3,"train_rows":8,"test_rows":2}\n\n',
    );

    expect(messages).toEqual([
      {
        event: "start",
        data: { epochs: 3, train_rows: 8, test_rows: 2 },
      },
    ]);
  });

  it("acumula frames partidos entre chunks", () => {
    const decoder = new SseDecoder();

    expect(decoder.decode("event: epoch\ndata: {\"epoch\":")).toEqual([]);
    expect(decoder.decode('1,"loss_train":0.5}\n\nevent: epoch\ndata: ')).toEqual([
      { event: "epoch", data: { epoch: 1, loss_train: 0.5 } },
    ]);
    expect(decoder.decode('{"epoch":2,"loss_train":0.4}\n\n')).toEqual([
      { event: "epoch", data: { epoch: 2, loss_train: 0.4 } },
    ]);
  });

  it("devuelve varios frames de un mismo chunk", () => {
    const decoder = new SseDecoder();
    const messages = decoder.decode(
      'event: epoch\ndata: {"epoch":1}\n\nevent: epoch\ndata: {"epoch":2}\n\n',
    );

    expect(messages).toHaveLength(2);
    expect(messages[0]?.data).toEqual({ epoch: 1 });
    expect(messages[1]?.data).toEqual({ epoch: 2 });
  });

  it("ignora comentarios y campos desconocidos", () => {
    const decoder = new SseDecoder();
    const messages = decoder.decode(
      ': keep-alive\nid: 7\nretry: 1000\nevent: final\ndata: {"id":1}\n\n',
    );

    expect(messages).toEqual([{ event: "final", data: { id: 1 } }]);
  });

  it("concatena varias líneas data en un solo payload", () => {
    const decoder = new SseDecoder();
    const messages = decoder.decode('event: error\ndata: {"code":\ndata: "divergence"}\n\n');

    expect(messages).toEqual([
      { event: "error", data: { code: "divergence" } },
    ]);
  });

  it("descarta el frame incompleto al cerrar sin separador", () => {
    const decoder = new SseDecoder();
    expect(decoder.decode('event: epoch\ndata: {"epoch":1}')).toEqual([]);
    expect(decoder.flush()).toEqual([]);
  });

  it("lanza error si el payload no es JSON válido", () => {
    const decoder = new SseDecoder();
    expect(() => decoder.decode("event: epoch\ndata: {roto\n\n")).toThrow(
      "Payload SSE inválido",
    );
  });
});

describe("readSseEvents", () => {
  it("lee un stream completo y descarta el resto sin separador", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: start\ndata: {"epochs":2}\n\n'));
        controller.enqueue(encoder.encode('event: epoch\ndata: {"epoch":1}\n\n'));
        controller.enqueue(encoder.encode('event: final\ndata: {"id":9}\n\n'));
        controller.enqueue(encoder.encode("event: epoch\ndata: {incompleto"));
        controller.close();
      },
    });

    const messages = [];
    for await (const message of readSseEvents(stream)) {
      messages.push(message);
    }

    expect(messages).toEqual([
      { event: "start", data: { epochs: 2 } },
      { event: "epoch", data: { epoch: 1 } },
      { event: "final", data: { id: 9 } },
    ]);
  });

  it("reparte la codificación UTF-8 entre chunks", async () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode('event: error\ndata: {"message":"época"}\n\n');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) {
          controller.enqueue(Uint8Array.of(byte));
        }
        controller.close();
      },
    });

    const messages = [];
    for await (const message of readSseEvents(stream)) {
      messages.push(message);
    }

    expect(messages).toEqual([
      { event: "error", data: { message: "época" } },
    ]);
  });
});
