
export async function startCamera(video) {
    if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Your browser does not support camera access.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 }
        },
        audio: false
    });

    video.srcObject = stream;
    await video.play();

    return stream;
}

export function stopCamera(video) {
    const stream = video.srcObject;

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }

    video.srcObject = null;
}
