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
let latestPose = null; 
let isPredicting = false;
let gameAnimationFrameId = null;

const POSE_MAP = [
    { lane: 0, id: "blue_left", color: "#29c5ff", poseName: "เอียงคอซ้าย", label: "เอียงคอซ้าย" },
    { lane: 0, id: "red_left", color: "#ff2d55", poseName: "ยืดแขนด้านซ้าย", label: "ยืดแขนซ้าย" },
    { lane: 1, id: "yellow", color: "#ffd23f", poseName: "ยืดขึ้น", label: "ยืดแขนตรง" },
    { lane: 2, id: "blue_right", color: "#29c5ff", poseName: "เอียงคอขวา", label: "เอียงคอขวา" },
    { lane: 2, id: "red_right", color: "#ff2d55", poseName: "ยืดแขนด้านขวา", label: "ยืดแขนขวา" }
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
let lastNoteSpawnTime = 0;

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

function predictLoop() {
    if (isCameraReady) {
        webcam.update();
        drawCamera(latestPose);

        if (!isPredicting) {
            isPredicting = true;
            
            (async () => {
                try {
                    const { pose, posenetOutput } = await model.estimatePose(webcam.canvas);
                    const prediction = await model.predict(posenetOutput);

                    let bestPred = prediction[0];
                    for (let i = 1; i < prediction.length; i++) {
                        if (prediction[i].probability > bestPred.probability) {
                            bestPred = prediction[i];
                        }
                    }

                    currentPose = bestPred.probability > CONFIDENCE_LIMIT ? bestPred.className.toLowerCase() : "none";
                    latestPose = pose;

                    let displayPoseName = currentPose;
                    if (currentPose !== "none") {
                    const foundPose = POSE_MAP.find(p => p.poseName.toLowerCase() === currentPose);
                    if (foundPose) {
                        displayPoseName = foundPose.label; 
                    }
    }

    const poseDisplay = document.getElementById("poseDisplay");
    if (poseDisplay) poseDisplay.innerText = displayPoseName;
                } catch (error) {
                    console.error("เกิดข้อผิดพลาดในการประมวลผล AI:", error);
                } finally {
                    isPredicting = false;
                }
            })();
        }
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
    // nextSpawnTime = 4.0;
    lastNoteSpawnTime = Date.now() - 4000;

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
    const minLength = 70;
    const maxLength = 220;
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

 
    let currentTimeMs = Date.now();
    
    if (currentTimeMs - lastNoteSpawnTime >= 4000) {
        spawnNote();
        lastNoteSpawnTime = currentTimeMs;
    }

    const laneWidth = gameCanvas.width / 3;
    const hitZoneY = 480;

    for (let i = activeNotes.length - 1; i >= 0; i--) {
        let note = activeNotes[i];
        note.y += 5;

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
// วาดกล่องมุมโค้งแบบรองรับเบราว์เซอร์ที่ไม่มี ctx.roundRect
function drawRoundedRect(context, x, y, w, h, r) {
    if (typeof context.roundRect === "function") {
        context.beginPath();
        context.roundRect(x, y, w, h, r);
        return;
    }
    const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    context.beginPath();
    context.moveTo(x + rad, y);
    context.arcTo(x + w, y, x + w, y + h, rad);
    context.arcTo(x + w, y + h, x, y + h, rad);
    context.arcTo(x, y + h, x, y, rad);
    context.arcTo(x, y, x + w, y, rad);
    context.closePath();
}

function drawGame() {
    ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

    const laneWidth = gameCanvas.width / 3;
    const noteWidth = laneWidth - 30;
    const hitZoneY = 480;
    const hitZoneHeight = 70;
    const laneTintColors = ["rgba(255, 45, 85, 0.05)", "rgba(255, 210, 63, 0.05)", "rgba(41, 197, 255, 0.05)"];

    // พื้นเลนไล่เฉดสี + เส้นแบ่งเรืองแสงบาง ๆ
    for (let i = 0; i < 3; i++) {
        const laneGrad = ctx.createLinearGradient(0, 0, 0, gameCanvas.height);
        laneGrad.addColorStop(0, "#0d0a1c");
        laneGrad.addColorStop(1, "#150c2b");
        ctx.fillStyle = laneGrad;
        ctx.fillRect(i * laneWidth, 0, laneWidth, gameCanvas.height);

        ctx.fillStyle = laneTintColors[i];
        ctx.fillRect(i * laneWidth, 0, laneWidth, gameCanvas.height);
    }

    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 1.5;
    for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(i * laneWidth, 0);
        ctx.lineTo(i * laneWidth, gameCanvas.height);
        ctx.stroke();
    }

    // Hit zone เรืองแสงแบบชีพจร (pulse) ให้ความรู้สึกมีชีวิตชีวา
    const pulse = 0.55 + Math.sin(Date.now() / 260) * 0.2;
    ctx.fillStyle = `rgba(185, 103, 255, ${0.10 * pulse + 0.05})`;
    ctx.fillRect(0, hitZoneY, gameCanvas.width, hitZoneHeight);

    ctx.save();
    ctx.shadowColor = `rgba(185, 103, 255, ${pulse})`;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = "#e8dcff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, hitZoneY);
    ctx.lineTo(gameCanvas.width, hitZoneY);
    ctx.stroke();
    ctx.restore();

    for (let note of activeNotes) {
        let x = (note.lane * laneWidth) + 15;
        let noteTop = note.y - note.length;
        const radius = Math.min(14, noteWidth / 2, note.length / 2);

        // แท่งโน้ตไล่เฉดสีจากตัวเองไปทึบ พร้อมแสงเรือง
        const noteGrad = ctx.createLinearGradient(x, noteTop, x, note.y);
        noteGrad.addColorStop(0, note.color);
        noteGrad.addColorStop(1, shadeColor(note.color, -25));

        ctx.save();
        ctx.shadowColor = note.color;
        ctx.shadowBlur = note.isBeingHeld ? 26 : 12;
        ctx.fillStyle = noteGrad;
        drawRoundedRect(ctx, x, noteTop, noteWidth, note.length, radius);
        ctx.fill();
        ctx.restore();

        if (note.isBeingHeld) {
            ctx.save();
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 3;
            drawRoundedRect(ctx, x, noteTop, noteWidth, note.length, radius);
            ctx.stroke();
            ctx.restore();
        }

        ctx.font = "700 18px 'Kanit', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = 4;
        ctx.fillText(note.label, x + (noteWidth / 2), noteTop + (note.length / 2));
        ctx.shadowBlur = 0; 
    }
}

// ปรับความสว่าง/มืดของสี hex เพื่อทำไล่เฉด (percent ติดลบ = เข้มขึ้น)
function shadeColor(hex, percent) {
    const num = parseInt(hex.replace("#", ""), 16);
    let r = (num >> 16) + Math.round(255 * (percent / 100));
    let g = ((num >> 8) & 0x00ff) + Math.round(255 * (percent / 100));
    let b = (num & 0x0000ff) + Math.round(255 * (percent / 100));
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return `rgb(${r}, ${g}, ${b})`;
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
