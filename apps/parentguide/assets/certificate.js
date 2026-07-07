/**
 * Renders a certificate onto a <canvas> and offers it as a PNG download.
 * No server involved — the image is generated and downloaded entirely in
 * the browser via canvas.toDataURL().
 */

function drawCertificate(canvas, { name, date }) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Outer border
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, W - 48, H - 48);

  // Inner navy border
  ctx.strokeStyle = "#0b1f3a";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(40, 40, W - 80, H - 80);

  // Wordmark
  ctx.fillStyle = "#111111";
  ctx.font = "900 44px Arial Black, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("SIFT", W / 2 - 30, 130);

  // Mark (three overlapping rectangles), drawn to the right of the wordmark
  const mx = W / 2 + 50;
  const my = 95;
  ctx.strokeStyle = "#0b1f3a";
  ctx.lineWidth = 3;
  ctx.strokeRect(mx, my, 44, 30);
  ctx.strokeRect(mx + 12, my + 10, 44, 30);
  ctx.strokeStyle = "#111111";
  ctx.strokeRect(mx + 24, my + 20, 44, 30);

  // Title
  ctx.fillStyle = "#111111";
  ctx.font = "bold 26px Arial, sans-serif";
  ctx.fillText("Certificate of Completion", W / 2, 200);

  // "This certifies that"
  ctx.font = "italic 16px Arial, sans-serif";
  ctx.fillStyle = "#555555";
  ctx.fillText("This certifies that", W / 2, 250);

  // Name
  ctx.font = "italic 40px Georgia, 'Times New Roman', serif";
  ctx.fillStyle = "#0b1f3a";
  const displayName = (name || "").trim() || "A SIFT ParentGuide reader";
  ctx.fillText(displayName, W / 2, 305);

  // Underline beneath the name
  const nameWidth = Math.min(ctx.measureText(displayName).width + 40, W - 200);
  ctx.strokeStyle = "#d9d9d9";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2 - nameWidth / 2, 322);
  ctx.lineTo(W / 2 + nameWidth / 2, 322);
  ctx.stroke();

  // Body
  ctx.font = "16px Arial, sans-serif";
  ctx.fillStyle = "#222222";
  ctx.fillText("has completed every module of the SIFT ParentGuide —", W / 2, 365);
  ctx.fillText("internet safety, digital citizenship, and how to spot and report a bad ad.", W / 2, 388);

  // Date
  ctx.font = "14px Arial, sans-serif";
  ctx.fillStyle = "#555555";
  ctx.fillText(date, W / 2, 430);

  // Tagline
  ctx.font = "italic 14px Arial, sans-serif";
  ctx.fillStyle = "#5a5a5a";
  ctx.fillText("Safe internet for them!", W / 2, H - 60);

  ctx.textAlign = "left"; // reset for anything drawn after this call
}

function downloadCanvasAsPng(canvas, filename) {
  const url = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

window.SIFTCertificate = { drawCertificate, downloadCanvasAsPng };
