const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const AdmZip = require('adm-zip');

// ==========================================
// CONFIGURACIÓN DE RUTAS EN TERMUX
// ==========================================
// /sdcard/Download/ apunta directamente a la carpeta "Descargas" de tu almacenamiento interno
const RUTA_ORIGEN_ZIP = '/sdcard/Download/vpanel.zip'; 
const REPO_PATH = path.join(__dirname); 

/**
 * Mueve, descomprime y sube el contenido de vpanel.zip al repositorio 'dixi'
 */
function procesarYSubirRepo() {
    // Verificar si el archivo vpanel.zip está en Descargas
    if (!fs.existsSync(RUTA_ORIGEN_ZIP)) {
        console.error(`[ERROR] No se encontró el archivo 'vpanel.zip' en: ${RUTA_ORIGEN_ZIP}`);
        console.error('Asegúrate de que el archivo esté exactamente en la carpeta de Descargas de tu teléfono.');
        process.exit(1);
    }

    try {
        const destinoZip = path.join(REPO_PATH, 'vpanel.zip');

        // 1. Copiar el archivo del almacenamiento de Android hacia el entorno de Termux
        console.log('[1/4] Copiando vpanel.zip al repositorio local en Termux...');
        fs.copyFileSync(RUTA_ORIGEN_ZIP, destinoZip);
        console.log('[OK] Archivo copiado.');

        // 2. Descomprimir el archivo zip
        console.log('[2/4] Descomprimiendo vpanel.zip en la raíz del proyecto...');
        const zip = new AdmZip(destinoZip);
        zip.extractAllTo(REPO_PATH, true);
        console.log('[OK] Archivos extraídos con éxito.');

        // 3. Limpieza del archivo comprimido temporal
        console.log('[3/4] Eliminando el archivo .zip temporal del repositorio...');
        fs.unlinkSync(destinoZip);
        console.log('[OK] Limpieza completada.');

        // 4. Automatización de comandos Git para el repositorio 'dixi'
        console.log('[4/4] Enviando cambios al repositorio remoto dixi...');
        
        console.log('-> git add .');
        execSync('git add .', { cwd: REPO_PATH, stdio: 'inherit' });

        const commitMessage = `Descompresión e inserción automática de vpanel.zip via Termux - ${new Date().toISOString()}`;
        console.log(`-> git commit -m "${commitMessage}"`);
        execSync(`git commit -m "${commitMessage}"`, { cwd: REPO_PATH, stdio: 'inherit' });

        console.log('-> git push origin main');
        // Nota: Si tu rama principal se llama 'master', cambia 'main' por 'master' abajo
        execSync('git push origin main', { cwd: REPO_PATH, stdio: 'inherit' });

        console.log('\n[ÉXITO] ¡Todo el contenido de vpanel.zip ha sido desplegado y descomprimido en el repo dixi!');

    } catch (error) {
        console.error('\n[ERROR] Ocurrió un fallo durante la ejecución:');
        console.error(error.message);
        process.exit(1);
    }
}

// Ejecutar el script automatizado
procesarYSubirRepo();

