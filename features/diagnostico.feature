# language: pt
Funcionalidade: Diagnosticar uma ordem de serviço
  Para informar o orçamento real ao orquestrador
  Como oficina
  Quero registrar o resultado encontrado pelo mecânico

  Cenário: Receber uma ordem para diagnóstico
    Dado uma ordem de serviço com um serviço solicitado
    Quando a oficina recebe o comando para iniciar o diagnóstico
    Então a ordem fica em diagnóstico

  Cenário: Não duplicar uma ordem quando o comando é repetido
    Dado uma ordem de serviço com um serviço solicitado
    Quando a oficina recebe o mesmo comando de diagnóstico duas vezes
    Então existe apenas uma ordem de serviço na oficina

  Cenário: Devolver os itens e preços encontrados
    Dado uma ordem de serviço com um serviço solicitado
    E a ordem está em diagnóstico
    Quando o mecânico conclui o diagnóstico com um serviço e uma peça encontrados
    Então a ordem fica diagnosticada
    E o orquestrador recebe os itens encontrados com os preços em centavos e a moeda

  Cenário: Informar que o veículo não pode ser reparado
    Dado uma ordem de serviço em diagnóstico
    Quando o mecânico informa que o veículo não pode ser reparado
    Então a ordem fica com falha
    E o orquestrador recebe a falha de diagnóstico com o motivo informado

  Cenário: Não concluir um diagnóstico duas vezes
    Dado uma ordem de serviço já diagnosticada
    Quando o mecânico tenta concluir o diagnóstico novamente
    Então a oficina rejeita a conclusão
    E nenhum novo evento de diagnóstico é enviado
