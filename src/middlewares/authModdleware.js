const jwt = require('jsonwebtoken');

const verificarAppToken = (req, res, next) => {
    // 1. Obtener el JWT enviado en la cabecera personalizada
    const tokenRecibido = req.headers['app-token'];

    // 2. Si el cliente no envió ningún token, se rechaza la petición
    if (!tokenRecibido) {
        return res.status(401).json({
            mensaje: "Acceso denegado. Falta el token de aplicación (JWT) en las cabeceras."
        });
    }

    try {
        // 3. Verificar y descodificar el JWT usando nuestra clave secreta
        const verificado = jwt.verify(tokenRecibido, process.env.JWT_SECRET);
        
        // Opcional: Validar que el payload contenga los datos correctos del sistema
        if (verificado.sistema !== 'App-Tareas-Corporativas') {
            return res.status(403).json({ mensaje: "Acceso denegado. Origen de aplicación no autorizado." });
        }

        // 4. Si el JWT es válido, permitimos que continúe el ciclo de la ruta
        req.appInfo = verificado; // Guardamos el payload en la petición por si se ocupa
        next();
    } catch (error) {
        // Si el JWT fue manipulado, expiró o es inválido, entra aquí
        return res.status(403).json({
            mensaje: "Acceso denegado. El token de aplicación (JWT) es inválido o corrupto."
        });
    }
};

module.exports = verificarAppToken;