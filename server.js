const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');
const path = require('path');

const app = express();
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

        // Tamaño de página en pulgadas (19x13)
        const pageWidth = 19 * 72;
        const pageHeight = 13 * 72;

        // Configuración de imágenes
        const imageWidth = (6.35 / 2.54) * 72;  // Convertir cm a puntos
        const imageHeight = (8.8 / 2.54) * 72;  // Convertir cm a puntos
        const spacing = (0.4 / 25.4) * 72;      // Espacio en puntos (1mm)

        const imagesPerRow = 7;
        const rowsPerPage = 3;
        const totalImagesPerPage = imagesPerRow * rowsPerPage;

        // Calcular el espacio total ocupado por las imágenes más el espaciado
        const totalImageWidth = (imagesPerRow * imageWidth) + ((imagesPerRow - 1) * spacing);
        const totalImageHeight = (rowsPerPage * imageHeight) + ((rowsPerPage - 1) * spacing);

        // Calcular los márgenes para centrar las imágenes
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

            // Convertir la imagen a PNG y agregar al PDF
            const imageBuffer = await sharp(req.files[i].buffer)
                .resize({ width: Math.round(imageWidth), height: Math.round(imageHeight) })
                .png()
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

        // Guardar el PDF
        const pdfBytes = await pdfDoc.save();
        const outputFilePath = path.join(__dirname, 'output.pdf');
        fs.writeFileSync(outputFilePath, pdfBytes);

        // Enviar el PDF al cliente
        res.download(outputFilePath, 'output.pdf', () => {
            // Eliminar el archivo después de que se haya enviado
            fs.unlinkSync(outputFilePath);
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error al generar el PDF.');
    }
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});
