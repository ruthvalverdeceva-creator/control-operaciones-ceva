/* ==========================================================================
   CONFIGURACIÓN DE SUPABASE Y CLIENTE
   ========================================================================== */
const SUPABASE_URL = 'https://bpwgyimcreewipewrynp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_z7CXbNSDMPB705qUpUp_7A_w19foNfz';

const CLAVE_TOKEN = "ceva_token";
let tokenSesion = null;
try { tokenSesion = localStorage.getItem(CLAVE_TOKEN) || null; } catch (e) {}

function crearCliente(token) {
  const opciones = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  if (token) opciones.global = { headers: { "x-val-token": token } };
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, opciones);
}

let supabaseClient = crearCliente(tokenSesion);

function fijarToken(token) {
  tokenSesion = token || null;
  try { token ? localStorage.setItem(CLAVE_TOKEN, token) : localStorage.removeItem(CLAVE_TOKEN); } catch (e) {}
  supabaseClient = crearCliente(tokenSesion);
}

let usuarioActual = null;

const $ = s => document.querySelector(s);

// ================= PÁGINA DE LOGIN =================
document.addEventListener("submit", async e => {
  if (!e.target || e.target.id !== "form-login") return;
  e.preventDefault();
  
  const usuarioInput = $("#login-usuario");
  const passwordInput = $("#login-password");
  const errDiv = $("#error-login");
  const btnIngresar = document.querySelector("#form-login .btn-ingresar");

  if (!usuarioInput) return;

  const usuario = usuarioInput.value.trim();
  const pass = passwordInput ? passwordInput.value : "";

  if (errDiv) errDiv.style.display = "none";
  if (btnIngresar) { 
    btnIngresar.disabled = true; 
    btnIngresar.textContent = "INGRESANDO…"; 
  }

  try {
    console.log("Intentando iniciar sesión con usuario:", usuario);
    
    const { data, error } = await supabaseClient.rpc("val_entrar", { 
      p_usuario: usuario, 
      p_password: pass || null 
    });

    console.log("Respuesta de Supabase:", data, error);

    if (error) throw new Error("Error en Supabase: " + error.message);
    if (!data || !data.ok) throw new Error((data && data.msg) || "Usuario o contraseña incorrectos en la base de datos.");
    
    fijarToken(data.token);
    usuarioActual = { usuario: data.usuario, nombre: data.nombre, cargo: data.cargo || "", rol: data.rol };
    
    const formLogin = $("#form-login");
    if (formLogin) formLogin.reset();
    
    verificarEstadoSesion();
  } catch (ex) {
    console.error("Falla en login:", ex);
    if (errDiv) { 
      errDiv.textContent = ex.message; 
      errDiv.style.display = "block"; 
    } else {
      alert(ex.message);
    }
  } finally {
    if (btnIngresar) { 
      btnIngresar.disabled = false; 
      btnIngresar.textContent = "INGRESAR"; 
    }
  }
});

function verificarEstadoSesion() {
  const vistaLogin = $("#vista-login");
  const contenedorPrincipal = $("#contenedor-principal");
  
  if (usuarioActual) {
    if (vistaLogin) vistaLogin.style.display = "none";
    if (contenedorPrincipal) contenedorPrincipal.style.display = "flex";
    const nombreDisplay = $("#nombre-usuario-display");
    const cargoDisplay = $("#cargo-usuario-display");
    if (nombreDisplay) nombreDisplay.textContent = usuarioActual.nombre;
    if (cargoDisplay) cargoDisplay.textContent = usuarioActual.cargo;
  } else {
    if (vistaLogin) vistaLogin.style.display = "flex";
    if (contenedorPrincipal) contenedorPrincipal.style.display = "none";
  }
}

async function cargarPerfil() {
  if (!tokenSesion) return null;
  try {
    const { data, error } = await supabaseClient.rpc("val_yo");
    if (error || !data) { fijarToken(null); return null; }
    return { usuario: data.usuario, nombre: data.nombre, cargo: data.cargo || "", rol: data.rol };
  } catch (err) { 
    return null; 
  }
}

// Inicialización al cargar la página
(async function iniciar() {
  usuarioActual = await cargarPerfil();
  verificarEstadoSesion();
})();

// ================= GESTIÓN DE EXCEL Y LOGS =================

// Función auxiliar para registrar mensajes en pantalla y consola
function registrarLog(mensaje, esError = false) {
    const logDiv = document.getElementById('log');
    if (!logDiv) return; // Si no está presente en la vista actual, solo imprime en consola
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
