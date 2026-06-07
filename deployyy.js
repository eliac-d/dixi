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
 * Función para eliminar de forma segura archivos o directorios si existen
 */
function eliminarSiExiste(ruta) {
    if (fs.existsSync(ruta)) {
        fs.rmSync(ruta, { recursive: true, force: true });
    }
}

/**
 * Extrae el contenido de la subcarpeta del ZIP directo en la raíz del repositorio
 */
function procesarYSubirRaiz() {
    // Validar existencia del archivo ZIP en Descargas
    if (!fs.existsSync(RUTA_ORIGEN_ZIP)) {
        console.error(`[ERROR] No se encontró el archivo 'vpanel.zip' en: ${RUTA_ORIGEN_ZIP}`);
        process.exit(1);
    }

    try {
        const destinoZip = path.join(REPO_PATH, 'vpanel.zip');
        const rutaTemporalExtraccion = path.join(REPO_PATH, 'temp_vpanel_extraccion');

        // 1. Limpieza preventiva total de la raíz para evitar conflictos con archivos viejos
        console.log('[1/5] Limpiando la raíz del repositorio para recibir la nueva estructura...');
        eliminarSiExiste(path.join(REPO_PATH, 'node_modules'));
        eliminarSiExiste(path.join(REPO_PATH, 'package.json'));
        eliminarSiExiste(path.join(REPO_PATH, 'package-lock.json'));
        eliminarSiExiste(path.join(REPO_PATH, 'public'));
        eliminarSiExiste(path.join(REPO_PATH, 'install.sh'));
        eliminarSiExiste(path.join(REPO_PATH, 'server.js'));
        eliminarSiExiste(path.join(REPO_PATH, 'vpanel'));
        eliminarSiExiste(rutaTemporalExtraccion);
        console.log('[OK] Raíz despejada.');

        // 2. Copiar el zip al entorno de trabajo
        console.log('[2/5] Copiando vpanel.zip al repositorio local en Termux...');
        fs.copyFileSync(RUTA_ORIGEN_ZIP, destinoZip);

        // 3. Descomprimir en una zona aislada
        console.log('[3/5] Descomprimiendo temporalmente el contenedor...');
        const zip = new AdmZip(destinoZip);
        zip.extractAllTo(rutaTemporalExtraccion, true);

        // 4. Mover el contenido de la carpeta interna 'vpanel' a la raíz real del repositorio
        console.log('[4/5] Trasladando archivos internos a la raíz del repositorio...');
        const rutaInternaVpanel = path.join(rutaTemporalExtraccion, 'vpanel');

        let directorioOrigen = rutaTemporalExtraccion;
        
        // Si los archivos están dentro de la carpeta 'vpanel', usamos esa subcarpeta
        if (fs.existsSync(rutaInternaVpanel)) {
            directorioOrigen = rutaInternaVpanel;
        }

        // Leer todos los archivos sueltos extraídos
        const elementos = fs.readdirSync(directorioOrigen);
        for (const elemento of elementos) {
            const rutaOrigenElemento = path.join(directorioOrigen, elemento);
            const rutaDestinoElemento = path.join(REPO_PATH, elemento);
            
            // Mover cada archivo/carpeta a la raíz del repositorio dixi
            fs.renameSync(rutaOrigenElemento, rutaDestinoElemento);
        }
        console.log('[OK] Elementos ubicados en la raíz exitosamente.');

        // Limpieza profunda de los archivos ZIP y carpetas temporales de cache
        eliminarSiExiste(destinoZip);
        eliminarSiExiste(rutaTemporalExtraccion);
        console.log('[OK] Limpieza de temporales finalizada.');

        // 5. Realizar el Push a GitHub con la estructura plana en la raíz
        console.log('[5/5] Sincronizando cambios con el repositorio remoto dixi...');
        
        console.log('-> git add .');
        execSync('git add .', { cwd: REPO_PATH, stdio: 'inherit' });

        const commitMessage = `Despliegue de estructura del panel en la raíz del repositorio - ${new Date().toISOString()}`;
        console.log(`-> git commit -m "${commitMessage}"`);
        try {
            execSync(`git commit -m "${commitMessage}"`, { cwd: REPO_PATH, stdio: 'inherit' });
        } catch (e) {
            console.log('-> No hay cambios nuevos que requieran commit.');
        }

        console.log('-> git push origin main');
        execSync('git push origin main', { cwd: REPO_PATH, stdio: 'inherit' });

        console.log('\n[ÉXITO] ¡Los archivos del panel ya están instalados directamente en la raíz de tu repositorio dixi!');

    } catch (error) {
        console.error('\n[ERROR] Ocurrió un fallo crítico en el procesamiento:');
        console.error(error.message);
        process.exit(1);
    }
}

// Ejecutar proceso estructurado
procesarYSubirRaiz();

