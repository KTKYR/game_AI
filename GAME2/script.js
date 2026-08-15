// ===============================
// 1. การตั้งค่า Teachable Machine & ท่าทาง
// ===============================
const MODEL_URL = "https://teachablemachine.withgoogle.com/models/qhYQpY7zf/"; // **นำ URL โมเดลของคุณมาใส่ที่นี่**
const CONFIDENCE_LIMIT = 0.80; 

let model, webcam, cameraCtx;
let currentPose = "none";
let isCameraReady = false;
let isModelLoaded = false;

const POSE_MAP = [
    { id: "red", color: "#ef233c", poseName: "left" },
    { id: "yellow", color: "#fee440", poseName: "up" },
    { id: "blue", color: "#00f5d4", poseName: "right" }
];

// ===============================
// 2. ตัวแปรระบบเกม
// ===============================
const gameCanvas = document.getElementById("gameCanvas");
const ctx = gameCanvas.getContext("2d");

let gameRunning = false;
let score = 0;
let startTime = 0;
let elapsedTime = 0;
let frameCount = 0;

const laneWidth = gameCanvas.width / 3;
const hitZoneY = 480;      // ตำแหน่งเส้นวัด (Hit Zone Line)
const hitZoneHeight = 70;  
const noteSpeed = 3.0;     // ปรับความเร็วบาร์ให้พอดีกับการยืดเส้น

let activeNotes = [];

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
        document.getElementById("loadingText").classList.add("hidden");
        
        isCameraReady = true;
        isModelLoaded = true;
        
        window.requestAnimationFrame(predictLoop);
        
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

        if (bestPred.probability > CONFIDENCE_LIMIT) {
            currentPose = bestPred.className.toLowerCase();
        } else {
            currentPose = "none";
        }

        document.getElementById("poseDisplay").innerText = currentPose;
        drawCamera(pose);
    }
    window.requestAnimationFrame(predictLoop);
}

function drawCamera(pose) {
    cameraCtx.drawImage(webcam.canvas, 0, 0);
    if (pose) {
        tmPose.drawKeypoints(pose.keypoints, 0.5, cameraCtx);
        tmPose.drawSkeleton(pose.keypoints, 0.5, cameraCtx);
    }
}

// ===============================
// 4. ระบบการเล่น (Game Logic)
// ===============================
function startGame() {
    gameRunning = true;
    score = 0;
    activeNotes = [];
    frameCount = 0;
    startTime = Date.now();
    
    document.getElementById("gameMenuScreen").classList.add("hidden");
    
    spawnNote(); 
    
    gameLoop();
}

function restartGame() {
    startGame();
}

function spawnNote() {
    const selectedPose = POSE_MAP[Math.floor(Math.random() * POSE_MAP.length)];
    const targetLane = Math.floor(Math.random() * 3);
    
    const noteLength = 300; // ความยาวบาร์ยืดเส้น
    
    activeNotes.push({
        lane: targetLane,
        y: -noteLength,
        length: noteLength,
        color: selectedPose.color,
        requiredPose: selectedPose.poseName.toLowerCase(),
        isBeingHeld: false
    });
}

function updateGame() {
    if (!gameRunning) return;

    frameCount++;
    elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
    document.getElementById("timeDisplay").innerText = elapsedTime;
    document.getElementById("scoreDisplay").innerText = score;

    // สร้างบาร์สีใหม่ทุกๆ ประมาณ 2 วินาที (120 เฟรม)
    if (frameCount % 240 === 0) {
        spawnNote();
    }

    for (let i = activeNotes.length - 1; i >= 0; i--) {
        let note = activeNotes[i];
        note.y += noteSpeed; // บาร์ค่อยๆ ตกลงมา

        let noteBottom = note.y;
        let noteTop = note.y - note.length;

        // 🎯 ตรวจสอบช่วงเวลาที่บาร์กำลังข้ามเส้นวัด (hitZoneY)
        if (noteBottom >= hitZoneY && noteTop <= hitZoneY) {
            if (currentPose === note.requiredPose) {
                // ยืดเส้นถูกต้อง -> บวกคะแนนสะสมรัวๆ
                score += 2; 
                note.isBeingHeld = true; // สถานะกำลังยืดสำเร็จ
            } else {
                note.isBeingHeld = false;
                
                // ระยะประนีประนอม 30px ให้ผู้เล่นมีเวลาขยับตัวเข้าท่าตอนขอบล่างเพิ่งถึงเส้น
                if (noteBottom > hitZoneY + 30) {
                    gameOver(); // ปล่อยท่าหลุดก่อนบาร์หมด -> Game Over ทันที!
                    return;
                }
            }
        }

        // 🎯 บาร์จะหายไปก็ต่อเมื่อ "ขอบบนสุด" (noteTop) ข้ามเส้นวัด hitZoneY ไปเรียบร้อยแล้วเท่านั้น
        if (noteTop > hitZoneY) {
            score += 10; // โบนัสยืดครบจนบาร์หมด
            activeNotes.splice(i, 1); // บาร์หายไปจากจอ
        }
    }
}

// ===============================
// 5. การแสดงผลกราฟิก (Rendering)
// ===============================
function drawGame() {
    ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

    // วาดเลน 3 ช่อง
    for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i % 2 === 0 ? "#1a1a2e" : "#16213e";
        ctx.fillRect(i * laneWidth, 0, laneWidth, gameCanvas.height);
    }

    // วาดเส้นวัด (Hit Zone Line)
    ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
    ctx.fillRect(0, hitZoneY, gameCanvas.width, hitZoneHeight);
    
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, hitZoneY);
    ctx.lineTo(gameCanvas.width, hitZoneY);
    ctx.stroke();

    // วาดแท่งบาร์สี
    for (let note of activeNotes) {
        let x = note.lane * laneWidth;
        
        ctx.fillStyle = note.color;
        ctx.fillRect(x + 15, note.y - note.length, laneWidth - 30, note.length);

        // 🌟 เอฟเฟกต์เรืองแสงสีขาวรอบบาร์เมื่อทำท่ายืดค้างไว้ถูกต้อง
        if (note.isBeingHeld) {
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 4;
            ctx.strokeRect(x + 15, note.y - note.length, laneWidth - 30, note.length);
        }
    }
}

function gameLoop() {
    if (!gameRunning) return;
    
    updateGame();
    drawGame();
    
    window.requestAnimationFrame(gameLoop);
}

function gameOver() {
    gameRunning = false;
    
    const menuScreen = document.getElementById("gameMenuScreen");
    menuScreen.classList.remove("hidden");
    
    document.getElementById("menuTitle").innerText = "GAME OVER!";
    document.getElementById("gameOverStats").classList.remove("hidden");
    document.getElementById("finalTime").innerText = elapsedTime;
    document.getElementById("finalScore").innerText = score;
    
    const btn = document.getElementById("mainActionBtn");
    btn.innerText = "เริ่มใหม่";
    btn.classList.remove("hidden"); 
    document.getElementById("menuLoadingText").classList.add("hidden"); 
}
