const express = require('express');
const multer = require('multer');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');

const app = express();
const port = 3000;

// Servir archivos estáticos desde la carpeta 'public'
app.use(express.static('public'));

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

        // Aumentar el DPI para mejorar la calidad (300 DPI)
        const dpi = 300;
        const pointsPerInch = dpi;

        // Tamaño de página en puntos (19x13 pulgadas a 300 DPI)
        const pageWidth = 19 * pointsPerInch;
        const pageHeight = 13 * pointsPerInch;

        // Configuración de imágenes
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

        for (let i = 0; i < req.files.length; i++) {
            if (i % totalImagesPerPage === 0) {
                const page = pdfDoc.addPage([pageWidth, pageHeight]);
                xOffset = marginX;
                yOffset = pageHeight - marginY - imageHeight;
            }

            // Convertir la imagen a PNG con alta calidad y redimensionar si es necesario
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
        }

        // Guardar el PDF en memoria y enviar al cliente
        const pdfBytes = await pdfDoc.save();

        // Comprobación de longitud del archivo antes de enviarlo
        console.log(`PDF generado, tamaño: ${pdfBytes.length} bytes`);

        // Enviar el PDF directamente en la respuesta
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="output.pdf"');
        res.send(Buffer.from(pdfBytes));
        
    } catch (err) {
        console.error('Error al generar el PDF:', err);
        res.status(500).send('Error al generar el PDF.');
    }
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});
