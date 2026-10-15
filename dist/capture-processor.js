class ClassroomCapture extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    if (input) this.port.postMessage(new Float32Array(input));
    for (const output of outputs) for (const channel of output) channel.fill(0);
    return true;
  }
}
registerProcessor('classroom-capture', ClassroomCapture);
