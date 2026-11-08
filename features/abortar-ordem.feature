# language: pt
Funcionalidade: Abortar uma ordem de serviço
  Para liberar a oficina durante uma compensação da saga
  Como orquestrador
  Quero interromper uma ordem que ainda não terminou

  Esquema do Cenário: Abortar uma ordem ainda aberta
    Dado uma ordem de serviço "<estado>"
    Quando o orquestrador solicita o aborto por timeout
    Então a ordem fica abortada
    E o orquestrador recebe a confirmação do aborto

    Exemplos:
      | estado         |
      | em diagnóstico |
      | diagnosticada  |
      | em execução    |
      | com falha      |

  Cenário: Não alterar uma ordem concluída
    Dado uma ordem de serviço concluída
    Quando o orquestrador solicita o aborto por timeout
    Então a ordem continua concluída
    E nenhum evento de aborto é enviado

  Cenário: Não repetir um aborto já concluído
    Dado uma ordem de serviço abortada
    Quando o orquestrador solicita o aborto por timeout
    Então a ordem continua abortada
    E nenhum novo evento de aborto é enviado
