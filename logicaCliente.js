var socket = io.connect("http://localhost:6969");
var turno,id,equipo,parrilla,listaInvitaciones,jugadoresInvitados,jugando; 
var inicializar = function() {
	turno = 0;
	parrilla = new Array();
	id = 0;
	equipo = -1;
	listaInvitaciones = [];
	jugadoresInvitados = [];
	jugando = false;
};

// FUNCION SOLO PARA DEPURAR
socket.on('mensaje',function(data){
		alert(data);
});

// Inicializa variables
window.onload = inicializar();
						
socket.on('connection', function(dataConnection) {
		
	if (!dataConnection.state)
	{
		alert('Error conectandose al servidor, reintente de nuevo.');
		return;
	}
});
				
		// Actualiza el display de jugadores
		socket.on('actualizarConteoDeJugadores', function(data) {
			// data -> contiene la lista de jugadores

			$('#jugadores').html('Jugadores conectados: ' + data.jugadores.length + '.<br />');
			//Actualiza la lista de jugadores 
			var html = '<ul>';
			for (var i = 0; i < data.jugadores.length; i++)
				if (data.jugadores[i].id != socket.socket.sessionid) // Pone en html jugadores diferentes al de la sesion
					html += '<li><a href="#" class="jugadores" id="' + data.jugadores[i].id +
					 '">' + data.jugadores[i].nombreUsuario + '</a></li>';
					html += '</ul>';
			$('#jugadores').append(html);
		});


		//Actualiza display de invitados
		socket.on('actualizaListaInvitados', function(data){
			//data -> {jugadorABorrar:jugadorABorrar, jugadores:listaJugadores}
			//La lista de jugadores ya NO tiene el jugador a borrar
			var html = '';
			$('#Invitados').empty();
			var nombreInvitado;
			var temp = new Array();
			var idABorrar = data.jugadorABorrar.id;
			for (var i = 0; i < jugadoresInvitados.length; i++)
			{
				if (jugadoresInvitados[i] != idABorrar)
				{
					temp.push(jugadoresInvitados[i]);
					nombreInvitado = regresaNombrePorId({idABuscar:jugadoresInvitados[i],jugadores:data.jugadores});
					html = '<div class="invitado">' + nombreInvitado + '</div>';
					$('#Invitados').append(html);
				}
			}
			jugadoresInvitados = temp;	// Remplaza lista de jugadores invitados con la actualizada
		});		

			
		function regresaNombrePorId(data){
			// data -> {idABuscar:jugadoresInvitados[i],jugadores:data.jugadores}
			for (var i = 0; i < data.jugadores.length; i++)
			{
				if(data.idABuscar == data.jugadores[i].id){
					return data.jugadores[i].nombreUsuario;
				}
			}
		}

		// Avisa que el nombre ya se esta usando
		socket.on('nombreUsuarioEstaRegistrado', function() {
			alert('El nombre de usuario ya esta siendo utilizado.');
		});
				

		// Avisa que el jugador ya se encuentra registrado
		socket.on('idEnUso', function() {
			alert("El ID de usuario esta siendo utilizado.");	
		});
		
		// Avisa de cancelacion de  y borra tablero y turno
		socket.on('gameCancelled', function(data) {
			alert(data.name + ' se desconecto, y el juego se cancelo');
			cleanDashboard();
			$('#turno').empty();
			inicializar(); // inicializa variables
		});

		// Avisa cuando no corresponde la jugada por turno de juego
		socket.on('jugadorEquivocado', function(data) {
			alert('Jugada no válida');
		});

		// Avisa cuando no puedo encontrar el juego 
		socket.on('juegoEquivocado', function(data) {
			alert('Juego no válido');
		});

		// Avisa que el jugador no ha finalizado el juego
		socket.on('enMedioDelJuego',function(data){
			//{nombreUsuario:regresaJugadorPorId(data.idResponde).nombreUsuario}
			alert(data.nombreUsuario +' no ha terminado el juego.');
		});

		var handler = function(){
			// Al presionar el boton se envia la posicion
			var pos = $(this).attr('id');
		    socket.emit('jugada', {pos:pos, id:socket.socket.sessionid});  
		};		

		socket.on('jugadorEstaListo', function(data) {
			// data -> contiene: estado del jugador, nombreUsuario viene como 'turno', Id
			// {estado:true, turno:regresaJugadorPorId(jugador1.id).nombreUsuario, id:jugador1.id}

			if (!data.estado)
				return;
		
			//Eliminar invitaciones que el generó y no han sido contestadas
			for (var i = jugadoresInvitados.length - 1; i > -1; i--)
			{
				socket.emit('limpiaInvitacionEnviada',
					{jugadorInvitado:jugadoresInvitados[i], jugadorAnfitrion:socket.socket.sessionid});
				borraPorIndice(jugadoresInvitados,i);	
			}

			//Declina invitaciones sin contestar			
			for (var i = listaInvitaciones.length -1; i > -1; i--)
			{
				// listaInvitaciones solo contiene IDs
				socket.emit('declinar',{jugador1Id:listaInvitaciones[i],jugador2Id:socket.socket.sessionid});
				$('#declinar_'+listaInvitaciones[i]).parents('.invitacion').remove();
				borraPorIndice(listaInvitaciones,i);
			}
			
			$('#dashboard').show();
			$('.boton').bind('click',handler);
			$('#turno').html("Es el turno de <u>" + data.turno + "</u>");// recordando 'turno' es nombreUsuario
		});

		socket.on('limpiaInvitacionLC',function(data){
			//data -> idAnfitrion
			var idALimpiar = data.idAnfitrion;
			var indice = listaInvitaciones.indexOf(idALimpiar);
			if(indice != -1)
			{
				$('#aceptar_'+idALimpiar).parent().remove();
				borraPorIndice(listaInvitaciones, indice);
			}
		});

		function borraPorIndice(arr, indice) {
 		   arr.splice(indice, 1);
		}
			
		socket.on('respuestaDeJuego', function(data) {
			// data -> contiene
			//{estado:true, equipo:(juego.turno)%2, pos:data.pos,
			//	jugadorEnTurno:regresaJugadorPorId(juego.jugadores[(juego.turno)%2]).nombreUsuario}

			if (!data.estado) //Si no es válido el estado
				return;
			if (data.equipo)
				dibujaMarca('X',data.pos);
			else
				dibujaMarca('O',data.pos);
			$('#turno').html("Es el turno de <u>" + data.jugadorEnTurno + "</u>");// recordando 'turno' es nickname
		});

		// Pone la marca correspondiente
		function dibujaMarca (marca, pos)
		{
			$('#' + pos).html(marca);
		}
			
		//Da el aviso de ganador
		socket.on('ganar', function(data) {
			// data -> puede contener los siguientes dos casos
			// {yo:true}
			// {yo:false, ganador:regresaGanadorPorId(juego.jugadores[0]).nombreUsuario}		
			if (data.yo)
				{
					$('#turno').text('Felicidades Ganaste !!!');
					$('.boton').unbind('click',handler);
					$('#continuar').show();
				}
				else
				{
					$('#turno').text('El ganador es: ' + data.ganador + ' ... suerte para la otra !');
					$('.boton').unbind('click',handler);
					$('#continuar').show();
				}	
		});

		socket.on('posibleEmpate',function(data){
				$('#turno').text('Empate, sigue jugando !!!');
				$('#continuar').show();
		});

		// Quita las marcas del tablero
		function cleanDashboard ()
		{
			for (var i = 0; i < 9; i++)
				$('#' + i).text("");
			$('#dashboard').hide();
		}
	
		// Jugador no registrado
		socket.on('noRegistrado', function() {
			alert('Necesita registrarse primero');
		});

		// El Id del invitado no es correcto y se tiene un error
		// de quien se quiere invitar
		socket.on('idDeInvitacionErroneo', function() {
			alert('El Id del jugador al que quieres invitar es incorrecto.');
		});
			

		// Coloca la invitacion en pantalla
		socket.on('invitacion', function(data) {
			//data -> contiene sessionid y nombreUsuario de quien invita

			var html = '<div class="invitacion">' + data.nombreUsuario +
			           '<a href="#" id="aceptar_' + data.id +
			           '"> Aceptar</a> | <a href="#" id="declinar_'+data.id+'">Declinar</a></div>';
			if(!jugando)
			{
				$('#invitaciones').append(html);//.append('<br/>');
				// Desabilita los links de los invitantes
				$('li > [id='+ data.id +  ']').click(function () {return false;});
				listaInvitaciones.push(data.id);

				// Asigna el evento click a 'ACEPTACION'
				$('#aceptar_'+data.id).bind('click', function() {
					//jugador1 -> el que invita; jugador2 -> quien responde
					borrarInvitacionesRecibidas(data);
					$('.jugadores').click(function(){return false;});
					jugando = true;
					socket.emit('aceptar', {jugador1Id:data.id, jugador2Id:socket.socket.sessionid});
				});

				// Asigna el evento click a 'RECHAZO'
				$('#decline_'+data.id).bind('click', function() {
					socket.emit('declinar', {jugador1Id:data.id, jugador2Id:socket.socket.sessionid});
					$('#declinar_'+data.id).parents('.invitacion').remove();
					
					//Remueve el jugador de la lista de invitaciones recibidas
					var indice = listaInvitaciones.indexOf(data.id);
					if(indice != -1)
					{ borraPorIndice(listaInvitaciones,indice); }
				});

				// Avisa de invitacion entregada
				socket.emit('invitacionEntregada',{idDeQuienInvita:data.id,idResponde:socket.socket.sessionid});
				socket.emit('agregarListaInvitadosS',{idDeQuienInvita:data.id,idResponde:socket.socket.sessionid});
			}
			else
			{
				socket.emit('enMedioDelJuego',{idDeQuienInvita:data.id,idResponde:socket.socket.sessionid});
			}
			
		});
		
		
		//Agrega invitado a lista de invitados
		socket.on('agregarListaInvitadosC',function(data){
			//{idResponde:data.idResponde, nombreInvitado:regresaJugadorPorId(data.idResponde).nombreUsuario}
			jugadoresInvitados.push(data.idResponde);

			var html = '<div class="invitado">' + data.nombreInvitado + '</div>';
			$('#Invitados').append(html);
		});


		function borrarInvitacionesRecibidas (data) {
			//data -> contiene sessionid y nombreUsuario de quien invita
			//Declina las invitaciones abiertas
			for (var i = 0; i < listaInvitaciones.length; i++)
				{
					if (listaInvitaciones[i] != data.id)
						{   // listaInvitaciones solo contiene IDs
							socket.emit('declinar',{jugador1Id:listaInvitaciones[i],jugador2Id:socket.socket.sessionid});
							$('#declinar_'+data.id).parents('.invitacion').remove();
						}
					}
			for (var i = listaInvitaciones.length - 1; i > -1; i--)
					borraPorIndice(listaInvitaciones,i);
			$('#invitaciones').empty();
		}

		// La invitacion ha sido rechazada
		socket.on('declinarLadoCliente', function(data) {
			//data.vieneDe
			alert(data.vieneDe + ' ha declinado tu invitacion.');
			// Elimina de la lista de invitados
			borraPorIndice(jugadoresInvitados,jugadoresInvitados.indexOf(data.vieneDe))
		});


		// Avisa que el jugador se encuentra enmedio de un juego.
		socket.on('estaJugando', function(data) {
			alert(data.name + ' se encuentra enmedio de un juego !');
		});
			
		// Avisa que no puede jugar consigo mismo 
		socket.on('tuMismo', function() {
			alert("No puedes jugar contigo mismo !");
		});

		socket.on('usuarioInvalido',function(){
			$('#nombreUsuario').attr('disabled',false);
			$('#registrar').show();
		});


		//Apaga el boron de registar
		socket.on('apagarBotonRegistrar', function(){
			$('#registrar').hide();
			$('#footer').text('DE LA ROSA ' + socket.socket.sessionid);
		});



	var finalizarJuego = function() {
			cleanDashboard();
			$('#dashboard').hide(); // Esconde el tablero
			$('#turno').empty();
			$('#continuar').hide();
			inicializar();
			$('.jugadores').unbind('click');// Reactiva links de lista de jugadores
			invitedPlayers.lenght = 0;
			jugando=false;
		}
				
// Asigna funcion al boton de registrar
$(document).ready(function() {

	$('#registrar').bind('click', function() {
		// Revisa si se seleciono un nombre de usuario
		if (!$('#nombreUsuario').val().length)
		{   // No se selecionó nombre de usuario
			alert('Selecciona un nombre de usuario.');
			return;
		}
		
		// Registra el nombre de usuario
		socket.emit('registrarJugador', {nombreUsuario:$('#nombreUsuario').val(), id:socket.socket.sessionid});
		jugando = false;
	});

	// Se selecciona una pareja de juego
	$('#jugadores > ul > li > a').live('click', function() {
		// Llama funcion que Invita un jugador, enviando
		// el identificador del jugador seleccionado

		//Seccion para asegurar solo una invitacion por jugador
		var invitar = true;
		var idAInvitar  = $(this).attr('id');
		for (var i = 0; i < jugadoresInvitados.length; i++)
		{
			if(jugadoresInvitados[i] == idAInvitar)
				invitar = false;
		}
			
		for (var i = 0; i < listaInvitaciones.length; i++)
		{
			if(listaInvitaciones[i] == idAInvitar)
				invitar = false;
		}
			
		if (invitar)	
		{
			// Envia la invitacion al jugador seleccionado
			socket.emit('invitarJugador', {id:idAInvitar});
			//jugadoresInvitados.push($(this).attr('id'));
		}
	});

	$('#dashboard').hide(); // Esconde el tablero
	$('#continuar').live('click', finalizarJuego);
	$('#continuar').hide(); // Esconde el link de continuar

});