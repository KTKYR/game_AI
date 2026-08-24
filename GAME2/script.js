// ===============================
// 1. การตั้งค่า Teachable Machine & ท่าทาง
// ===============================
const MODEL_URL = "https://teachablemachine.withgoogle.com/models/fS1o6k0GB/";
const CONFIDENCE_LIMIT = 0.80;

let model, webcam, cameraCtx;
let currentPose = "none";
let isCameraReady = false;
let isModelLoaded = false;
let predictAnimationFrameId = null;
let gameAnimationFrameId = null;

const POSE_MAP = [
    { lane: 0, id: "blue_left", color: "#0072f5", poseName: "เอียงคอซ้าย", label: "เอียงคอซ้าย" },
    { lane: 0, id: "red_left", color: "#ef233c", poseName: "ยืดแขนด้านซ้าย", label: "ยืดแขนซ้าย" },
    { lane: 1, id: "yellow", color: "#fee440", poseName: "ยืดขึ้น", label: "ยืดขึ้น" },
    { lane: 2, id: "blue_right", color: "#0072f5", poseName: "เอียงคอขวา", label: "เอียงคอขวา" },
    { lane: 2, id: "red_right", color: "#ef233c", poseName: "ยืดแขนด้านขวา", label: "ยืดแขนขวา" }
];

// ===============================
// 2. ตัวแปรระบบเกม & เสียงเพลง
// ===============================
const gameCanvas = document.getElementById("gameCanvas");
const ctx = gameCanvas.getContext("2d");

let gameRunning = false;
let score = 0;
let startTime = 0;
let elapsedTime = 0;

let activeNotes = [];
let lastSpawnLane = -1;

let audioPlayer = new Audio();
// audioPlayer.crossOrigin = "anonymous";

let songList = [
    { name: "🎵 ถิ่นชงโค", url: "./mp3/thinchongkho.mp3"},
    { name: "🎵 Boy Don't Cry", url: "./mp3/Boys_Dont_Cry.mp3"}
];
let currentSongIndex = 0;
let nextSpawnTime = 0;
// let secondsPerBeat = 0;

audioPlayer.onerror = function () {
    console.warn("⚠️ ไม่สามารถเล่นเสียงจากลิงก์นี้ได้ ระบบสลับไปใช้เสียงสำรองชั่วคราว");
    audioPlayer.src = "./mp3/thinchongkho.mp3";
    audioPlayer.play().catch(e => console.error("Audio fallback play failed:", e));
};

function initSongs() {
    const container = document.getElementById("songListContainer");
    if (!container) return;

    container.innerHTML = "";

    songList.forEach((song, index) => {
        let btn = document.createElement("div");
        btn.className = `song-block ${index === currentSongIndex ? 'active' : ''}`;

        btn.onclick = () => {
            currentSongIndex = index;
            initSongs();
        };

        btn.innerHTML = `
            <span class="song-name">${song.name}</span>
        `;

        container.appendChild(btn);
    });
}

initSongs();

// ===============================
// 3. ฟังก์ชันเริ่มต้นและการทำงาน AI
// ===============================
function handleMenuAction() {
    const btn = document.getElementById("mainActionBtn");

    if (!isModelLoaded) {
        btn.classList.add("hidden");
        document.getElementById("menuLoadingText").classList.remove("hidden");
        init();
    } else {
        restartGame();
    }
}

async function init() {
    try {
        const modelURL = MODEL_URL + "model.json";
        const metadataURL = MODEL_URL + "metadata.json";
        model = await tmPose.load(modelURL, metadataURL);

        webcam = new tmPose.Webcam(300, 300, true);
        await webcam.setup();
        await webcam.play();

        const cameraCanvas = document.getElementById("cameraCanvas");
        cameraCtx = cameraCanvas.getContext("2d");

        const loadingText = document.getElementById("loadingText");
        if (loadingText) loadingText.classList.add("hidden");

        isCameraReady = true;
        isModelLoaded = true;

        if (!predictAnimationFrameId) predictLoop();

        document.getElementById("gameMenuScreen").classList.add("hidden");
        startGame();

    } catch (error) {
        alert("เกิดข้อผิดพลาดในการโหลดโมเดล กรุณาตรวจสอบ URL หรือการอนุญาตใช้กล้อง");
        console.error(error);
        document.getElementById("mainActionBtn").classList.remove("hidden");
        document.getElementById("menuLoadingText").classList.add("hidden");
    }
}

async function predictLoop() {
    if (isCameraReady) {
        webcam.update();
        const { pose, posenetOutput } = await model.estimatePose(webcam.canvas);
        const prediction = await model.predict(posenetOutput);

        let bestPred = prediction[0];
        for (let i = 1; i < prediction.length; i++) {
            if (prediction[i].probability > bestPred.probability) {
                bestPred = prediction[i];
            }
        }

        currentPose = bestPred.probability > CONFIDENCE_LIMIT ? bestPred.className.toLowerCase() : "none";

        const poseDisplay = document.getElementById("poseDisplay");
        if (poseDisplay) poseDisplay.innerText = currentPose;

        drawCamera(pose);
    }
    predictAnimationFrameId = window.requestAnimationFrame(predictLoop);
}

function drawCamera(pose) {
    cameraCtx.drawImage(webcam.canvas, 0, 0);
    if (pose) {
        tmPose.drawKeypoints(pose.keypoints, 0.5, cameraCtx);
        tmPose.drawSkeleton(pose.keypoints, 0.5, cameraCtx);
    }
}

// ===============================
// 4. ระบบการเล่น & อิงตามเพลง
// ===============================
function startGame() {
    if (gameAnimationFrameId) cancelAnimationFrame(gameAnimationFrameId);

    gameRunning = true;
    score = 0;
    activeNotes = [];
    lastSpawnLane = -1;

    const song = songList[currentSongIndex];
    audioPlayer.src = song.url;
    audioPlayer.currentTime = 0;

    audioPlayer.play().catch(error => {
        console.warn("Autoplay ถูกบล็อกหรือลิงก์เพลงมีปัญหา:", error);
    });

    // secondsPerBeat = 60 / song.bpm;
    nextSpawnTime = 3.0;

    startTime = Date.now();
    document.getElementById("gameMenuScreen").classList.add("hidden");
    gameLoop();
}

function restartGame() {
    startGame();
}

function spawnNote() {
    let availableConfigs = POSE_MAP.filter(config => config.lane !== lastSpawnLane);
    if (availableConfigs.length === 0) availableConfigs = POSE_MAP;

    const selectedConfig = availableConfigs[Math.floor(Math.random() * availableConfigs.length)];
    lastSpawnLane = selectedConfig.lane;

    // 🎲 สุ่มความยาวของบาร์ (สั้นสุด 70px / ยาวสุด 220px)
    const minLength = 70;  // ความยาวบาร์สั้นสุด
    const maxLength = 220; // ความยาวบาร์ยาวสุด
    const noteLength = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
    
    activeNotes.push({
        lane: selectedConfig.lane,
        y: -noteLength,
        length: noteLength,
        color: selectedConfig.color,
        requiredPose: selectedConfig.poseName.toLowerCase(),
        label: selectedConfig.label,
        isBeingHeld: false
    });
}

function updateGame() {
    if (!gameRunning) return;

    if (audioPlayer.paused || isNaN(audioPlayer.currentTime) || audioPlayer.currentTime === 0) {
        elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
    } else {
        elapsedTime = audioPlayer.currentTime.toFixed(1);
    }

    const timeDisplay = document.getElementById("timeDisplay");
    const scoreDisplay = document.getElementById("scoreDisplay");
    if (timeDisplay) timeDisplay.innerText = elapsedTime;
    if (scoreDisplay) scoreDisplay.innerText = score;

    if (audioPlayer.ended) {
        gameOver("จบเพลง! เก่งมาก! 🎉");
        return;
    }

    let checkTime = (audioPlayer.paused || audioPlayer.currentTime === 0) ? (Date.now() - startTime) / 1000 : audioPlayer.currentTime;

    if (checkTime >= nextSpawnTime) {
        spawnNote();
        nextSpawnTime += 3.0;
    }

    const laneWidth = gameCanvas.width / 3;
    const hitZoneY = 480;

    for (let i = activeNotes.length - 1; i >= 0; i--) {
        let note = activeNotes[i];
        note.y += 5; // ความเร็วของบาร์

        let noteBottom = note.y;
        let noteTop = note.y - note.length;

        if (noteBottom >= hitZoneY && noteTop <= hitZoneY) {
            if (currentPose === note.requiredPose) {
                score += 2;
                note.isBeingHeld = true;
            } else {
                note.isBeingHeld = false;

                if (currentPose !== "none" && currentPose !== note.requiredPose) {
                    gameOver("ทำท่าผิด! เกมโอเวอร์ 😭");
                    return;
                }

                if (noteBottom > hitZoneY + 50) {
                    gameOver("ทำท่าไม่ทัน! เกมโอเวอร์ 😭");
                    return;
                }
            }
        }

        if (noteTop > hitZoneY) {
            score += 10;
            activeNotes.splice(i, 1);
        }
    }
}

// ===============================
// 5. การแสดงผลกราฟิก
// ===============================
function drawGame() {
    ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

    const laneWidth = gameCanvas.width / 3;
    const noteWidth = laneWidth - 30;
    const hitZoneY = 480;
    const hitZoneHeight = 70;

    for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i % 2 === 0 ? "#1a1a2e" : "#16213e";
        ctx.fillRect(i * laneWidth, 0, laneWidth, gameCanvas.height);
    }

    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 2;
    for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(i * laneWidth, 0);
        ctx.lineTo(i * laneWidth, gameCanvas.height);
        ctx.stroke();
    }

    ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
    ctx.fillRect(0, hitZoneY, gameCanvas.width, hitZoneHeight);

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, hitZoneY);
    ctx.lineTo(gameCanvas.width, hitZoneY);
    ctx.stroke();

    for (let note of activeNotes) {
        let x = (note.lane * laneWidth) + 15;
        let noteTop = note.y - note.length;

        ctx.fillStyle = note.color;
        ctx.fillRect(x, noteTop, noteWidth, note.length);

        if (note.isBeingHeld) {
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 4;
            ctx.strokeRect(x, noteTop, noteWidth, note.length);
        }

        ctx.font = "bold 18px 'MyCustomFont'";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(note.label, x + (noteWidth / 2), noteTop + (note.length / 2));
    }
}

function gameLoop() {
    if (!gameRunning) return;
    
    updateGame();
    drawGame();
    
    gameAnimationFrameId = window.requestAnimationFrame(gameLoop);
}

function gameOver(reasonText = "คุณทำท่ายืดเส้นไม่ทัน บาร์หมดไปแล้ว! 😭") {
    gameRunning = false;
    audioPlayer.pause();
    
    if (gameAnimationFrameId) cancelAnimationFrame(gameAnimationFrameId);
    
    const menuScreen = document.getElementById("gameMenuScreen");
    menuScreen.classList.remove("hidden");
    
    document.getElementById("menuTitle").innerText = "GAME OVER!";
    
    const statsP = document.querySelector("#gameOverStats p:first-child");
    if (statsP) statsP.innerText = reasonText;
    
    document.getElementById("gameOverStats").classList.remove("hidden");
    document.getElementById("finalTime").innerText = elapsedTime;
    document.getElementById("finalScore").innerText = score;
    
    const btn = document.getElementById("mainActionBtn");
    btn.innerText = "เริ่มใหม่";
    btn.classList.remove("hidden"); 
    document.getElementById("menuLoadingText").classList.add("hidden"); 
}
