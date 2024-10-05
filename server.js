const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = 3000;

// Servir archivos estáticos desde la carpeta 'public'
app.use(express.static(path.resolve(__dirname, 'public')));

// Ruta principal para servir el archivo HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Configurar Multer para la subida de imágenes
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024, // Tamaño máximo por archivo (50MB)
        files: 200 // Límite de archivos
    }
});

// Ruta para subir imágenes y generar el PDF
app.post('/upload', upload.array('images', 200), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).send('No se subieron imágenes.');
        }

        // Crear un nuevo documento PDF
        const pdfDoc = await PDFDocument.create();

        const dpi = 300;
        const pointsPerInch = dpi;
        const pageWidth = 19 * pointsPerInch;
        const pageHeight = 13 * pointsPerInch;

        const imageWidth = (6.35 / 2.54) * pointsPerInch;
        const imageHeight = (8.8 / 2.54) * pointsPerInch;
        const spacing = (0.4 / 25.4) * pointsPerInch;

        const imagesPerRow = 7;
        const rowsPerPage = 3;
        const totalImagesPerPage = imagesPerRow * rowsPerPage;

        const totalImageWidth = (imagesPerRow * imageWidth) + ((imagesPerRow - 1) * spacing);
        const totalImageHeight = (rowsPerPage * imageHeight) + ((rowsPerPage - 1) * spacing);
        const marginX = (pageWidth - totalImageWidth) / 2;
        const marginY = (pageHeight - totalImageHeight) / 2;

        let xOffset = marginX;
        let yOffset = pageHeight - marginY - imageHeight;

        // Emitir progreso inicial (0%)
        io.emit('progress', { percent: 0, status: 'Iniciando la creación del PDF...' });

        for (let i = 0; i < req.files.length; i++) {
            if (i % totalImagesPerPage === 0) {
                pdfDoc.addPage([pageWidth, pageHeight]);
                xOffset = marginX;
                yOffset = pageHeight - marginY - imageHeight;
            }

            const imageBuffer = await sharp(req.files[i].buffer)
                .resize({
                    width: Math.round(imageWidth),
                    height: Math.round(imageHeight),
                    fit: 'inside',
                    kernel: sharp.kernel.lanczos3
                })
                .png({ quality: 100, compressionLevel: 0 })
                .toBuffer();

            const image = await pdfDoc.embedPng(imageBuffer);
            const page = pdfDoc.getPages()[pdfDoc.getPageCount() - 1];
            page.drawImage(image, {
                x: xOffset,
                y: yOffset,
                width: imageWidth,
                height: imageHeight,
            });

            xOffset += imageWidth + spacing;

            if ((i + 1) % imagesPerRow === 0) {
                xOffset = marginX;
                yOffset -= imageHeight + spacing;
            }

            // Emitir progreso
            const progress = Math.round(((i + 1) / req.files.length) * 100);
            io.emit('progress', { percent: progress, status: `Procesando imagen ${i + 1} de ${req.files.length}` });
        }

        // Emitir progreso del 100%
        io.emit('progress', { percent: 100, status: 'PDF generado, comenzando descarga...' });

        // Transmitir el PDF directamente al cliente
        const pdfBytes = await pdfDoc.save();
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="output.pdf"',
            'Content-Length': pdfBytes.length
        });

        res.send(Buffer.from(pdfBytes)); // Enviar los bytes directamente al cliente

    } catch (err) {
        console.error(err);
        res.status(500).send('Error al generar el PDF.');
    }
});

// Iniciar el servidor
server.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});
