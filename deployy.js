const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const AdmZip = require('adm-zip');

// ==========================================
// CONFIGURACIÓN DE RUTAS EN TERMUX
// ==========================================
const RUTA_ORIGEN_ZIP = '/sdcard/Download/vpanel.zip'; 
const REPO_PATH = path.join(__dirname); 

/**
 * Función para eliminar archivos o carpetas recursivamente si existen
 */
function eliminarSiExiste(ruta) {
    if (fs.existsSync(ruta)) {
        fs.rmSync(ruta, { recursive: true, force: true });
    }
}

/**
 * Procesa el ZIP de forma quirúrgica para aislar únicamente 'vpanel'
 */
function procesarYSubirRepo() {
    // Verificar si el archivo vpanel.zip está en Descargas
    if (!fs.existsSync(RUTA_ORIGEN_ZIP)) {
        console.error(`[ERROR] No se encontró el archivo 'vpanel.zip' en: ${RUTA_ORIGEN_ZIP}`);
        process.exit(1);
    }

    try {
        const destinoZip = path.join(REPO_PATH, 'vpanel.zip');
        const rutaTemporalExtraccion = path.join(REPO_PATH, 'temp_vpanel_extraccion');

        // Limpieza previa de cualquier residuo incorrecto en la raíz antes de operar
        console.log('[1/5] Limpiando archivos mezclados incorrectamente en la raíz...');
        eliminarSiExiste(path.join(REPO_PATH, 'node_modules'));
        eliminarSiExiste(path.join(REPO_PATH, 'package.json'));
        eliminarSiExiste(path.join(REPO_PATH, 'package-lock.json'));
        eliminarSiExiste(path.join(REPO_PATH, 'public'));
        eliminarSiExiste(path.join(REPO_PATH, 'install.sh'));
        eliminarSiExiste(path.join(REPO_PATH, 'server.js'));
        eliminarSiExiste(path.join(REPO_PATH, 'vpanel'));
        eliminarSiExiste(rutaTemporalExtraccion);
        console.log('[OK] Raíz del repositorio desinfectada.');

        // 1. Copiar el archivo zip de forma local
        console.log('[2/5] Copiando vpanel.zip al entorno de Termux...');
        fs.copyFileSync(RUTA_ORIGEN_ZIP, destinoZip);

        // 2. Descomprimir temporalmente en una carpeta aislada
        console.log('[3/5] Extrayendo contenido en directorio aislado...');
        const zip = new AdmZip(destinoZip);
        zip.extractAllTo(rutaTemporalExtraccion, true);

        // 3. Mover únicamente la carpeta vpanel estructurada a la raíz
        const origenVpanel = path.join(rutaTemporalExtraccion, 'vpanel');
        const destinoVpanel = path.join(REPO_PATH, 'vpanel');

        if (fs.existsSync(origenVpanel)) {
            fs.renameSync(origenVpanel, destinoVpanel);
            console.log('[OK] Carpeta "vpanel" reubicada correctamente.');
        } else if (fs.existsSync(path.join(rutaTemporalExtraccion, 'server.js'))) {
            // En caso de que el zip no contuviera la carpeta interna sino los archivos sueltos
            fs.mkdirSync(destinoVpanel, { recursive: true });
            const archivos = fs.readdirSync(rutaTemporalExtraccion);
            for (const archivo of archivos) {
                if (archivo !== 'vpanel.zip') {
                    fs.renameSync(path.join(rutaTemporalExtraccion, archivo), path.join(destinoVpanel, archivo));
                }
            }
            console.log('[OK] Archivos sueltos agrupados dentro de la carpeta "vpanel".');
        }

        // 4. Limpieza absoluta de temporales
        console.log('[4/5] Eliminando archivos de cache y carpetas temporales...');
        eliminarSiExiste(destinoZip);
        eliminarSiExiste(rutaTemporalExtraccion);
        console.log('[OK] Limpieza profunda ejecutada.');

        // 5. Enviar únicamente la carpeta vpanel estructurada a GitHub
        console.log('[5/5] Sincronizando cambios de "vpanel" con el repositorio remoto dixi...');
        
        console.log('-> git add .');
        execSync('git add .', { cwd: REPO_PATH, stdio: 'inherit' });

        const commitMessage = `Estructuración e inserción limpia de vpanel via Termux - ${new Date().toISOString()}`;
        console.log(`-> git commit -m "${commitMessage}"`);
        // Ejecutamos commit. Si no hay cambios reales que guardar, no romperá el flujo.
        try {
            execSync(`git commit -m "${commitMessage}"`, { cwd: REPO_PATH, stdio: 'inherit' });
        } catch (e) {
            console.log('-> No se detectaron cambios nuevos para hacer commit.');
        }

        console.log('-> git push origin main');
        execSync('git push origin main', { cwd: REPO_PATH, stdio: 'inherit' });

        console.log('\n[ÉXITO] ¡Únicamente el panel se ha procesado y subido correctamente a tu repositorio!');

    } catch (error) {
        console.error('\n[ERROR] Fallo crítico en el procesamiento:');
        console.error(error.message);
        process.exit(1);
    }
}

// Ejecutar el script corregido
procesarYSubirRepo();

