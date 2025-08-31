#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const imagemin = require('imagemin').default;
const imageminPngquant = require('imagemin-pngquant').default;

async function testCompression() {
  const imagePath = path.join(process.cwd(), 'generated-diff-image-uncompressed.png');
  
  if (!fs.existsSync(imagePath)) {
    console.log('❌ No image found. Generate one first with: node generate-and-read-diff.js');
    return;
  }
  
  const originalBuffer = fs.readFileSync(imagePath);
  const originalStats = fs.statSync(imagePath);
  console.log(`\n📊 Original image size: ${(originalStats.size / 1024).toFixed(1)} KB`);
  
  // Test Sharp compression
  console.log('\n🔧 Testing Sharp compression...');
  const sharpStart = Date.now();
  const sharpBuffer = await sharp(originalBuffer)
    .png({
      compressionLevel: 9,
      palette: true,
      quality: 95,
      effort: 10
    })
    .toBuffer();
  const sharpTime = Date.now() - sharpStart;
  
  const sharpReduction = ((1 - sharpBuffer.length / originalStats.size) * 100).toFixed(1);
  console.log(`✅ Sharp: ${(sharpBuffer.length / 1024).toFixed(1)} KB (${sharpReduction}% reduction) in ${sharpTime}ms`);
  
  // Test PngQuant compression via imagemin
  console.log('\n🔧 Testing PngQuant (imagemin) compression...');
  const pngquantStart = Date.now();
  
  // Write temp file for imagemin
  const tempInput = path.join(process.cwd(), 'temp-input.png');
  fs.writeFileSync(tempInput, originalBuffer);
  
  const pngquantFiles = await imagemin([tempInput], {
    destination: process.cwd(),
    plugins: [
      imageminPngquant({
        quality: [0.85, 0.95],  // Min and max quality
        speed: 1,               // Slowest but best compression
        strip: true             // Strip metadata
      })
    ]
  });
  
  const pngquantBuffer = fs.readFileSync(pngquantFiles[0].destinationPath);
  fs.unlinkSync(tempInput);
  fs.unlinkSync(pngquantFiles[0].destinationPath);
  const pngquantTime = Date.now() - pngquantStart;
  
  const pngquantReduction = ((1 - pngquantBuffer.length / originalStats.size) * 100).toFixed(1);
  console.log(`✅ PngQuant: ${(pngquantBuffer.length / 1024).toFixed(1)} KB (${pngquantReduction}% reduction) in ${pngquantTime}ms`);
  
  // Test combined approach: Sharp first, then PngQuant
  console.log('\n🔧 Testing Combined (Sharp → PngQuant) compression...');
  const combinedStart = Date.now();
  
  // First pass with Sharp (basic optimization)
  const sharpFirstPass = await sharp(originalBuffer)
    .png({
      compressionLevel: 6,  // Medium compression for speed
      effort: 5
    })
    .toBuffer();
  
  // Second pass with PngQuant (lossy compression)
  const tempCombined = path.join(process.cwd(), 'temp-combined.png');
  fs.writeFileSync(tempCombined, sharpFirstPass);
  
  const combinedFiles = await imagemin([tempCombined], {
    destination: process.cwd(),
    plugins: [
      imageminPngquant({
        quality: [0.85, 0.95],
        speed: 1,
        strip: true
      })
    ]
  });
  
  const combinedBuffer = fs.readFileSync(combinedFiles[0].destinationPath);
  fs.unlinkSync(tempCombined);
  fs.unlinkSync(combinedFiles[0].destinationPath);
  const combinedTime = Date.now() - combinedStart;
  
  const combinedReduction = ((1 - combinedBuffer.length / originalStats.size) * 100).toFixed(1);
  console.log(`✅ Combined: ${(combinedBuffer.length / 1024).toFixed(1)} KB (${combinedReduction}% reduction) in ${combinedTime}ms`);
  
  // Compare results
  console.log('\n📈 Compression Benchmark Results:');
  console.log('=====================================');
  console.log(`Original:     ${(originalStats.size / 1024).toFixed(1)} KB`);
  console.log(`Sharp:        ${(sharpBuffer.length / 1024).toFixed(1)} KB (${sharpReduction}% smaller) - ${sharpTime}ms`);
  console.log(`PngQuant:     ${(pngquantBuffer.length / 1024).toFixed(1)} KB (${pngquantReduction}% smaller) - ${pngquantTime}ms`);
  console.log(`Combined:     ${(combinedBuffer.length / 1024).toFixed(1)} KB (${combinedReduction}% smaller) - ${combinedTime}ms`);
  
  // Determine winner
  const results = [
    { name: 'Sharp', size: sharpBuffer.length, reduction: sharpReduction, time: sharpTime },
    { name: 'PngQuant', size: pngquantBuffer.length, reduction: pngquantReduction, time: pngquantTime },
    { name: 'Combined', size: combinedBuffer.length, reduction: combinedReduction, time: combinedTime }
  ];
  
  const winner = results.reduce((prev, curr) => curr.size < prev.size ? curr : prev);
  
  console.log(`\n🏆 Winner: ${winner.name} with ${(winner.size / 1024).toFixed(1)} KB (${winner.reduction}% reduction) in ${winner.time}ms`);
  
  // Save the best compressed version
  if (winner.name === 'PngQuant') {
    fs.writeFileSync(imagePath, pngquantBuffer);
    console.log(`\n✅ Updated generated-diff-image.png with PngQuant compression`);
  } else if (winner.name === 'Combined') {
    fs.writeFileSync(imagePath, combinedBuffer);
    console.log(`\n✅ Updated generated-diff-image.png with Combined compression`);
  }
}

testCompression().catch(console.error);