import { Global, Module, OnApplicationShutdown, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import source from './data-source';
@Injectable()
class DatabaseShutdown implements OnApplicationShutdown {
 constructor(private readonly db:DataSource){}
 async onApplicationShutdown(){if(this.db.isInitialized)await this.db.destroy();}
}
@Global()
@Module({providers:[{provide:DataSource,useFactory:async()=>{
 await source.initialize();
 if(await source.showMigrations()){await source.destroy();throw new Error('DB còn migration chưa chạy. Chạy npm run migration:run trước khi start backend.');}
 return source;
}},DatabaseShutdown],exports:[DataSource]})
export class DatabaseModule {}
