# language: pt
Funcionalidade: Executar os serviços aprovados
  Para concluir o trabalho autorizado
  Como mecânico
  Quero registrar cada serviço concluído

  Cenário: Iniciar os serviços aprovados
    Dado uma ordem de serviço diagnosticada com dois serviços
    Quando a oficina recebe o comando para iniciar a execução dos serviços aprovados
    Então a ordem fica em execução

  Cenário: Aguardar todos os serviços antes de concluir a ordem
    Dado uma ordem de serviço em execução com dois serviços
    Quando o mecânico conclui apenas um dos serviços
    Então a ordem continua em execução
    E o orquestrador ainda não recebe a conclusão da execução

  Cenário: Publicar a conclusão quando todos os serviços terminam
    Dado uma ordem de serviço em execução com dois serviços
    Quando o mecânico conclui os dois serviços
    Então a ordem fica concluída
    E o orquestrador recebe a conclusão com o tempo de cada serviço

  Cenário: Recusar um serviço que não pertence à ordem
    Dado uma ordem de serviço em execução com dois serviços
    Quando o mecânico tenta concluir um serviço que não pertence à ordem
    Então a oficina rejeita a conclusão do serviço

  Cenário: Falhar somente os serviços pendentes informados
    Dado uma ordem de serviço em execução com dois serviços e um já concluído
    Quando o mecânico informa que um dos serviços pendentes falhou por falta de peça
    Então a ordem fica com falha
    E o orquestrador recebe somente o serviço afetado

  Cenário: Falhar todos os serviços ainda pendentes
    Dado uma ordem de serviço em execução com dois serviços e um já concluído
    Quando o mecânico informa uma falha sem indicar serviços específicos
    Então o orquestrador recebe todos os serviços ainda pendentes como afetados
