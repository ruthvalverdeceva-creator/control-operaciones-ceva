// Función auxiliar para registrar mensajes en pantalla y consola
function registrarLog(mensaje, esError = false) {
    const logDiv = document.getElementById('log');
    const color = esError ? '#ff6b6b' : '#00ff00';
    logDiv.innerHTML += `<div style="color: ${color};">[${new Date().toLocaleTimeString()}] ${mensaje}</div>`;
    logDiv.scrollTop = logDiv.scrollHeight;
    console.log(mensaje);
}

// Escuchar cuando el usuario seleccione un archivo Excel
document.addEventListener('DOMContentLoaded', () => {
    const inputExcel = document.getElementById('inputExcel');
    if (inputExcel) {
        inputExcel.addEventListener('change', procesarExcelDinamico);
    }
});

/**
 * Procesa el archivo Excel de manera dinámica buscando las columnas por sus encabezados (FO, Fase, etc.)
 */
function procesarExcelDinamico(e) {
    const archivo = e.target.files[0];
    if (!archivo) return;

    registrarLog(`Cargando archivo: ${archivo.name}...`);

    const lector = new FileReader();
    lector.onload = function (evento) {
        try {
            const datos = new Uint8Array(evento.target.result);
            const libro = XLSX.read(datos, { type: 'array' });
            
            // Tomamos la primera hoja del libro de Excel
            const nombreHoja = libro.SheetNames[0];
            const hoja = libro.Sheets[nombreHoja];
            
            // Convertimos la hoja a JSON usando la primera fila como cabecera (encabezados)
            const filasJson = XLSX.utils.sheet_to_json(hoja, { defval: "" });

            if (filasJson.length === 0) {
                registrarLog("El archivo Excel está vacío o no tiene datos legibles.", true);
                return;
            }

            registrarLog(`Total de filas leídas: ${filasJson.length}`);

            // Identificamos las columnas de forma dinámica buscando coincidencias en los encabezados
            const primeraFila = filasJson[0];
            const llaves = Object.keys(primeraFila);

            // Búsqueda inteligente e insensible a mayúsculas/minúsculas de FO y Fase
            const colFO = llaves.find(k => k.trim().toUpperCase() === 'FO' || k.trim().toUpperCase() === 'FO REAL' || k.trim().toUpperCase().includes('FO'));
            const colFase = llaves.find(k => k.trim().toUpperCase() === 'FASE' || k.trim().toUpperCase().includes('FASE'));

            if (!colFO || !colFase) {
                registrarLog("ERROR: No se detectaron automáticamente las columnas 'FO' y 'Fase' en los encabezados.", true);
                registrarLog(`Encabezados encontrados en tu Excel: [ ${llaves.join(', ')} ]`, true);
                return;
            }

            registrarLog(`¡Columnas detectadas con éxito! -> FO: [${colFO}] | Fase: [${colFase}]`);

            // Procesamos cada registro de manera limpia
            const resultadosProcesados = filasJson.map((fila, index) => {
                return {
                    fila: index + 2, // Fila real en el Excel (contando cabecera)
                    fo: fila[colFO],
                    fase: fila[colFase]
                };
            }).filter(item => item.fo !== "" || item.fase !== ""); // Filtramos filas vacías

            registrarLog(`Procesamiento exitoso. Se validaron ${resultadosProcesados.length} registros.`);
            console.table(resultadosProcesados.slice(0, 5)); // Muestra una muestra en la consola F12

            // Aquí puedes conectar el envío hacia tu backend o la lógica de almacenamiento
            enviarDatosAlServidor(resultadosProcesados);

        } catch (error) {
            registrarLog(`Error al procesar el archivo: ${error.message}`, true);
        }
    };

    lector.readAsArrayBuffer(archivo);
}

function enviarDatosAlServidor(datos) {
    registrarLog("Datos listos para sincronizar con la lógica de operaciones o Drive.");
}
