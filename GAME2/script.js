// ===============================
// 1. การตั้งค่า Teachable Machine & ท่าทาง
// ===============================
const MODEL_URL = "https://teachablemachine.withgoogle.com/models/fS1o6k0GB/"; // 🛠️ URL โมเดล
const CONFIDENCE_LIMIT = 0.80; 

let model, webcam, cameraCtx;
let currentPose = "none"; // ต้องมีคลาส "none" (ท่ายืนเฉยๆ) ในโมเดลด้วย
let isCameraReady = false;
let isModelLoaded = false;
let predictAnimationFrameId = null;
let gameAnimationFrameId = null;

// ปรับปรุง POSE_MAP ใหม่ให้ตรงกับ labels ใน metadata.json
const POSE_MAP = [
    // หลักที่ 1 (ซ้าย: lane 0)
    { lane: 0, id: "blue_left", color: "#0072f5", poseName: "เอียงคอซ้าย", label: "เอียงคอซ้าย" },
    { lane: 0, id: "red_left", color: "#ef233c", poseName: "ยืดแขนซ้าย", label: "ยืดแขนซ้าย" },
    
    // หลักที่ 2 (กลาง: lane 1)
    { lane: 1, id: "yellow", color: "#fee440", poseName: "ยืดขึ้น", label: "ยืดขึ้น" },
    
    // หลักที่ 3 (ขวา: lane 2)
    { lane: 2, id: "blue_right", color: "#0072f5", poseName: "เอียงคอขวา", label: "เอียงคอขวา" },
    { lane: 2, id: "red_right", color: "#ef233c", poseName: "ยืดแขนขวา", label: "ยืดแขนขวา" }
];
// ===============================
// 2. ตัวแปรระบบเกม & Canvas
// ===============================
const gameCanvas = document.getElementById("gameCanvas");
const ctx = gameCanvas.getContext("2d");

let gameRunning = false;
let score = 0;
let startTime = 0;
let elapsedTime = 0;
let frameCount = 0;

const laneWidth = gameCanvas.width / 3; // 450 / 3 = 150px
const noteWidth = laneWidth - 30;       // ความกว้างโน้ต 120px
const hitZoneY = 480;                   // ตำแหน่งเส้นวัด
const hitZoneHeight = 70;   
const noteSpeed = 3.0;     

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
        
        const loadingText = document.getElementById("loadingText");
        if (loadingText) loadingText.classList.add("hidden");
        
        isCameraReady = true;
        isModelLoaded = true;
        
        if (!predictAnimationFrameId) {
            predictLoop();
        }
        
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
// 4. ระบบการเล่น (Game Logic)
// ===============================
function startGame() {
    if (gameAnimationFrameId) {
        cancelAnimationFrame(gameAnimationFrameId);
    }

    gameRunning = true;
    score = 0;
    activeNotes = [];
    frameCount = 0;
    startTime = Date.now();
    
    document.getElementById("gameMenuScreen").classList.add("hidden");
    gameLoop();
}

function restartGame() {
    startGame();
}

function spawnNote() {
    // สุ่มจาก 3 ท่าทาง (ซึ่งแต่ละท่าผูกกับเลน 0, 1, 2 เรียบร้อยแล้ว)
    const selectedConfig = POSE_MAP[Math.floor(Math.random() * POSE_MAP.length)];
    const noteLength = 300; 
    
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

    frameCount++;
    elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
    
    const timeDisplay = document.getElementById("timeDisplay");
    const scoreDisplay = document.getElementById("scoreDisplay");
    if (timeDisplay) timeDisplay.innerText = elapsedTime;
    if (scoreDisplay) scoreDisplay.innerText = score;

    // สปอว์นบาร์ใหม่ทุกๆ 240 เฟรม (~4 วินาที)
    if (frameCount === 1 || frameCount % 240 === 0) {
        spawnNote();
    }

    for (let i = activeNotes.length - 1; i >= 0; i--) {
        let note = activeNotes[i];
        note.y += noteSpeed;

        let noteBottom = note.y;
        let noteTop = note.y - note.length;

        // 🎯 ตรวจสอบช่วงเวลาที่บาร์กำลังข้ามเส้นวัด
        if (noteBottom >= hitZoneY && noteTop <= hitZoneY) {
            if (currentPose === note.requiredPose) {
                score += 2; 
                note.isBeingHeld = true;
            } else {
                note.isBeingHeld = false;
                
                // กฎใหม่: ถ้าทำท่าผิด (ไม่ใช่ none และไม่ใช่ท่าที่ถูกต้อง) ให้แพ้ทันที
                if (currentPose !== "none" && currentPose !== note.requiredPose) {
                    gameOver("ทำท่าผิด! เกมโอเวอร์ 😭");
                    return;
                }
                
                // กฎเดิม: ถ้าบาร์หลุดเส้นวัด (ทำไม่ทัน) ให้แพ้
                if (noteBottom > hitZoneY + 150) {
                    gameOver("ทำท่าไม่ทัน! เกมโอเวอร์ 😭");
                    return;
                }
            }
        }

        // 🎯 บาร์หายไปเมื่อขอบบนข้ามเส้นวัด
        if (noteTop > hitZoneY) {
            score += 10; 
            activeNotes.splice(i, 1);
        }
    }
}
// ===============================
// 5. การแสดงผลกราฟิก (Rendering)
// ===============================
function drawGame() {
    ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

    // 1. วาดพื้นหลังเลน 3 ช่อง
    for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i % 2 === 0 ? "#1a1a2e" : "#16213e";
        ctx.fillRect(i * laneWidth, 0, laneWidth, gameCanvas.height);
    }

    // 2. วาดเส้นแบ่งเลนแนวตั้ง 2 เส้น (กั้นช่อง ซ้าย-กลาง-ขวา)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 2;
    for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(i * laneWidth, 0);
        ctx.lineTo(i * laneWidth, gameCanvas.height);
        ctx.stroke();
    }

    // 3. วาดเส้นวัด (Hit Zone Line)
    ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
    ctx.fillRect(0, hitZoneY, gameCanvas.width, hitZoneHeight);
    
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, hitZoneY);
    ctx.lineTo(gameCanvas.width, hitZoneY);
    ctx.stroke();

    // 4. วาดแท่งบาร์สีและตัวอักษรบอกท่า
    for (let note of activeNotes) {
        let x = (note.lane * laneWidth) + 15;
        let noteTop = note.y - note.length;
        
        ctx.fillStyle = note.color;
        ctx.fillRect(x, noteTop, noteWidth, note.length);

        // แสดงกรอบเรืองแสงเมื่อผู้เล่นทำท่าถูกต้อง
        if (note.isBeingHeld) {
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 4;
            ctx.strokeRect(x, noteTop, noteWidth, note.length);
        }

        // เขียนข้อความบอกชื่อท่ากำกับไว้ตรงกลางบาร์
        ctx.fillStyle = "#000000";
        ctx.font = "bold 16px Kanit, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
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
    if (gameAnimationFrameId) {
        cancelAnimationFrame(gameAnimationFrameId);
    }
    
    const menuScreen = document.getElementById("gameMenuScreen");
    menuScreen.classList.remove("hidden");
    
    document.getElementById("menuTitle").innerText = "GAME OVER!";
    // อัปเดตข้อความสาเหตุการแพ้
    document.querySelector("#gameOverStats p:first-child").innerText = reasonText;
    
    document.getElementById("gameOverStats").classList.remove("hidden");
    document.getElementById("finalTime").innerText = elapsedTime;
    document.getElementById("finalScore").innerText = score;
    
    const btn = document.getElementById("mainActionBtn");
    btn.innerText = "เริ่มใหม่";
    btn.classList.remove("hidden"); 
    document.getElementById("menuLoadingText").classList.add("hidden"); 
}
